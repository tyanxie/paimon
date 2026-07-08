// 通用右键/长按上下文菜单：Portal 到 body，glass-popover 样式

import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  /** 菜单锚点坐标（鼠标/触摸位置） */
  position: ContextMenuPosition;
  /** 关闭回调 */
  onClose: () => void;
  /** 菜单内容 */
  children: ReactNode;
}

/** 计算菜单实际位置，确保不溢出视口 */
function clampPosition(
  position: ContextMenuPosition,
  menuRect: { width: number; height: number },
  padding = 12,
): { left: number; top: number } {
  const { innerWidth, innerHeight } = window;
  let left = position.x;
  let top = position.y;

  // 右侧溢出：向左翻转
  if (left + menuRect.width + padding > innerWidth) {
    left = innerWidth - menuRect.width - padding;
  }
  // 底部溢出：向上翻转
  if (top + menuRect.height + padding > innerHeight) {
    top = innerHeight - menuRect.height - padding;
  }
  // 确保不超出左/上边界
  left = Math.max(padding, left);
  top = Math.max(padding, top);

  return { left, top };
}

export function ContextMenu({ position, onClose, children }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 稳定引用的 close，避免 effect 因 onClose 变化反复重绑
  const stableClose = useCallback(() => onCloseRef.current(), []);

  // 点击外部/右键其他位置关闭
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        stableClose();
      }
    }
    function handleContextMenu(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        stableClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        stableClose();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [stableClose]);

  // 首次渲染后根据实际尺寸调整位置
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const clamped = clampPosition(position, {
        width: rect.width,
        height: rect.height,
      });
      menuRef.current.style.left = `${clamped.left}px`;
      menuRef.current.style.top = `${clamped.top}px`;
      menuRef.current.style.opacity = "1";
    }
  }, [position]);

  return createPortal(
    <div
      ref={menuRef}
      className="glass-popover z-50 py-1.5 min-w-[160px]"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        opacity: 0, // 首帧隐藏，clamp 后显示
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** 菜单项 */
interface ContextMenuItemProps {
  /** 图标（可选） */
  icon?: ReactNode;
  /** 标签文字 */
  label: string;
  /** 是否为危险操作（红色文字） */
  danger?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 点击回调 */
  onClick: () => void;
}

export function ContextMenuItem({
  icon,
  label,
  danger = false,
  disabled = false,
  onClick,
}: ContextMenuItemProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-[13px] leading-[18px] transition-colors ${
        disabled
          ? "opacity-40 cursor-default"
          : danger
            ? "text-red-500 hover:bg-[var(--fill-tertiary)]"
            : "text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)]"
      }`}
    >
      {icon && (
        <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
          {icon}
        </span>
      )}
      <span>{label}</span>
    </button>
  );
}
