// 通用 Popover 浮层组件：Portal 到 body，glass-popover 样式

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** 弹出方向 */
export type PopoverPlacement = "top" | "bottom";
/** 水平对齐 */
export type PopoverAlign = "left" | "right";

interface PopoverProps {
  /** 渲染触发按钮，接收 open 状态 */
  trigger: (props: { open: boolean; id: string }) => ReactNode;
  /** 弹层的可访问名称 */
  label?: string;
  /** 面板宽度（px） */
  width?: number;
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
  children,
  disabled = false,
  placement = "top",
  align = "right",
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const close = useCallback(() => {
    setOpen(false);
    containerRef.current?.querySelector("button")?.focus();
  }, []);

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
  }, [open, close]);

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
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(calcPosition(rect, placement, align, 8, 12, width));
    setOpen(true);
  };

  const popoverPortal =
    open && position
      ? createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role={label ? "dialog" : undefined}
            aria-label={label}
            tabIndex={-1}
            className="glass-popover z-50"
            style={{
              position: "fixed",
              ...(position.left !== undefined
                ? { left: position.left }
                : { right: position.right }),
              ...(position.top !== undefined
                ? { top: position.top }
                : { bottom: position.bottom }),
              width: `${width}px`,
              maxWidth: "calc(100vw - 24px)",
            }}
          >
            {children(close)}
          </div>,
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
