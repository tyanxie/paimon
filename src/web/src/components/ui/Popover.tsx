// 通用 Popover 浮层组件：Portal 到 body，glass-popover 样式

import { useState, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** 弹出方向 */
export type PopoverPlacement = "top" | "bottom";

interface PopoverProps {
  /** 渲染触发按钮，接收 open 状态 */
  trigger: (props: { open: boolean }) => ReactNode;
  /** 面板宽度（px） */
  width?: number;
  /** 面板内容，接收 close 回调 */
  children: (close: () => void) => ReactNode;
  /** 禁用弹出 */
  disabled?: boolean;
  /** 弹出方向：top（向上，默认）或 bottom（向下） */
  placement?: PopoverPlacement;
}

interface PopoverPosition {
  right: number;
  top?: number;
  bottom?: number;
}

/** 计算 Popover 位置：向上弹出，右对齐锚点 */
export function calcPosition(
  anchorRect: Pick<DOMRect, "top" | "bottom" | "right">,
  placement: PopoverPlacement = "top",
  margin = 8,
  viewportPadding = 12,
): PopoverPosition {
  const { innerWidth, innerHeight } = window;
  const right = Math.max(viewportPadding, innerWidth - anchorRect.right);

  if (placement === "bottom") {
    return {
      right,
      top: Math.max(viewportPadding, anchorRect.bottom + margin),
    };
  }

  return {
    right,
    bottom: Math.max(viewportPadding, innerHeight - anchorRect.top + margin),
  };
}

export function Popover({
  trigger,
  width = 200,
  children,
  disabled = false,
  placement = "top",
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // resize / scroll 时关闭（popover 内部滚动除外）
  useEffect(() => {
    if (!open) return;
    const closeOnResize = () => setOpen(false);
    const closeOnScroll = (e: Event) => {
      if (popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("resize", closeOnResize);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      window.removeEventListener("resize", closeOnResize);
      window.removeEventListener("scroll", closeOnScroll, true);
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
    setPosition(calcPosition(rect, placement));
    setOpen(true);
  };

  const close = () => setOpen(false);

  const popoverPortal =
    open && position
      ? createPortal(
          <div
            ref={popoverRef}
            className="glass-popover z-50"
            style={{
              position: "fixed",
              right: position.right,
              ...(position.top !== undefined
                ? { top: position.top }
                : { bottom: position.bottom }),
              width: `${width}px`,
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
      <div className="relative" ref={containerRef} onClick={toggle}>
        {trigger({ open })}
      </div>
      {popoverPortal}
    </>
  );
}
