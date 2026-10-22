// 通用 Popover 浮层组件：Portal 到 body，glass-popover 样式

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnimatePresence } from "motion/react";
import { FloatingSurface } from "./FloatingSurface";
import { useFloatingViewport } from "./useFloatingViewport";
import { createPortal } from "react-dom";

/** 弹出方向 */
type PopoverPlacement = "top" | "bottom";
/** 水平对齐 */
type PopoverAlign = "left" | "right";

interface PopoverProps {
  /** 渲染触发按钮，接收 open 状态 */
  trigger: (props: { open: boolean; id: string }) => ReactNode;
  /** 弹层的可访问名称 */
  label?: string;
  /** 面板宽度（px） */
  width?: number;
  /** 面板高度上限（px），同时受可用视口空间限制。 */
  maxHeight?: number;
  /** 面板内容，接收 close 回调 */
  children: (close: () => void) => ReactNode;
  /** 禁用弹出 */
  disabled?: boolean;
  /** 弹出方向：top（向上，默认）或 bottom（向下） */
  placement?: PopoverPlacement;
  /** 水平对齐：left（左对齐锚点）或 right（右对齐锚点，默认） */
  align?: PopoverAlign;
}

interface PopoverPosition {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

/** 计算 Popover 位置 */
export function calcPosition(
  anchorRect: Pick<DOMRect, "top" | "bottom" | "left" | "right">,
  placement: PopoverPlacement = "top",
  align: PopoverAlign = "right",
  margin = 8,
  viewportPadding = 12,
  width = 0,
): PopoverPosition {
  const { innerWidth, innerHeight } = window;

  // 水平定位
  const horizontal: Pick<PopoverPosition, "left" | "right"> =
    align === "left"
      ? {
          left: Math.max(
            viewportPadding,
            Math.min(
              anchorRect.left,
              innerWidth -
                Math.min(width, Math.max(0, innerWidth - viewportPadding * 2)) -
                viewportPadding,
            ),
          ),
        }
      : { right: Math.max(viewportPadding, innerWidth - anchorRect.right) };

  // 垂直定位
  if (placement === "bottom") {
    return {
      ...horizontal,
      top: Math.max(viewportPadding, anchorRect.bottom + margin),
    };
  }

  return {
    ...horizontal,
    bottom: Math.max(viewportPadding, innerHeight - anchorRect.top + margin),
  };
}

export function Popover({
  trigger,
  label,
  width = 200,
  maxHeight = Infinity,
  children,
  disabled = false,
  placement = "top",
  align = "right",
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const bounds = useFloatingViewport(open);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const close = useCallback(() => {
    setOpen(false);
    containerRef.current?.querySelector("button")?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = Math.min(width, Math.max(0, bounds.width - 24));
    const anchorTop = Math.max(
      bounds.top + 12,
      Math.min(rect.top, bounds.top + bounds.height - 12),
    );
    const anchorBottom = Math.max(
      anchorTop,
      Math.min(rect.bottom, bounds.top + bounds.height - 12),
    );
    const availableAbove = Math.max(0, anchorTop - bounds.top - 20);
    const availableBelow = Math.max(
      0,
      bounds.top + bounds.height - anchorBottom - 20,
    );
    const below =
      placement === "bottom"
        ? availableBelow >= 160 || availableBelow >= availableAbove
        : availableAbove < 160 && availableBelow > availableAbove;
    const left = Math.max(
      bounds.left + 12,
      Math.min(
        align === "left" ? rect.left : rect.right - panelWidth,
        bounds.left + bounds.width - panelWidth - 12,
      ),
    );
    const compactViewport = Math.max(availableAbove, availableBelow) < 160;
    setPosition({
      left,
      ...(compactViewport
        ? { top: bounds.top + 12 }
        : below
          ? { top: Math.max(bounds.top + 12, anchorBottom + 8) }
          : { bottom: Math.max(12, window.innerHeight - anchorTop + 8) }),
      maxHeight: Math.min(
        maxHeight,
        compactViewport
          ? Math.max(0, bounds.height - 24)
          : below
            ? availableBelow
            : availableAbove,
      ),
    });
  }, [open, bounds, width, maxHeight, placement, align]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const panel = popoverRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      (
        panel.querySelector<HTMLElement>("input, button:not([disabled])") ??
        panel
      ).focus();
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, !!position, close]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("click", handleClick);
    };
  }, [open]);

  // resize 时关闭（锚点在固定定位面板上，scroll 不影响其位置，无需关闭）
  useEffect(() => {
    if (!open) return;
    const closeOnResize = () => setOpen(false);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("resize", closeOnResize);
    };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
  };

  const popoverPortal = position
    ? createPortal(
        <AnimatePresence>
          {open && position && (
            <FloatingSurface
              key="popover"
              ref={popoverRef}
              id={popoverId}
              role={label ? "dialog" : undefined}
              aria-label={label}
              tabIndex={-1}
              className="z-50"
              style={{
                position: "fixed",
                ...position,
                width: `${Math.min(width, Math.max(0, bounds.width - 24))}px`,
                maxWidth: "calc(100vw - 24px)",
              }}
            >
              {children(close)}
            </FloatingSurface>
          )}
        </AnimatePresence>,
        document.body,
      )
    : null;

  return (
    <>
      {/* 触发区域：包裹一层 div 用于绑定点击和定位 */}
      <div className="relative min-w-0" ref={containerRef} onClick={toggle}>
        {trigger({ open, id: popoverId })}
      </div>
      {popoverPortal}
    </>
  );
}
