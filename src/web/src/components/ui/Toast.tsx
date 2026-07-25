// 轻量 Toast 提示组件（支持分级）
// macOS 26 Notification 风格：浮动毛玻璃面板 + 滑入/淡出动画
// 级别通过左侧彩色图标区分，保持整体 Liquid Glass 材质统一

import { useEffect, useRef, useState } from "react";
import {
  Info,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

export type ToastLevel = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: number;
  message: string;
  level: ToastLevel;
  /** 动画阶段：entering → visible → exiting */
  phase: "entering" | "visible" | "exiting";
}

let toastId = 0;
let listeners: Array<(toast: ToastItem) => void> = [];

/** 全局触发一条 toast，level 默认 info */
export function showToast(message: string, level: ToastLevel = "info") {
  const item: ToastItem = { id: ++toastId, message, level, phase: "entering" };
  listeners.forEach((fn) => fn(item));
}

const TOAST_ENTER_MS = 16; // 一帧后切换到 visible 触发 CSS transition
const TOAST_EXIT_MS = 300;

// 不同级别的持续时间
const DURATION_MAP: Record<ToastLevel, number> = {
  info: 3000,
  success: 3000,
  warning: 4000,
  error: 5000,
};

// 级别对应的图标组件
const ICON_MAP: Record<ToastLevel, LucideIcon> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};

// 级别对应的颜色 CSS 变量
const COLOR_MAP: Record<ToastLevel, string> = {
  info: "var(--toast-icon-info)",
  success: "var(--toast-icon-success)",
  warning: "var(--toast-icon-warning)",
  error: "var(--toast-icon-error)",
};

/** Toast 容器，放在 App 顶层即可 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const handler = (item: ToastItem) => {
      setToasts((prev) => [...prev, item]);

      // 入场：下一帧切到 visible 触发 transition
      const enterTimer = setTimeout(() => {
        timersRef.current.delete(enterTimer);
        setToasts((prev) =>
          prev.map((t) => (t.id === item.id ? { ...t, phase: "visible" } : t)),
        );
      }, TOAST_ENTER_MS);
      timersRef.current.add(enterTimer);

      // 到时间后进入退出动画
      const duration = DURATION_MAP[item.level];
      const exitTimer = setTimeout(() => {
        timersRef.current.delete(exitTimer);
        setToasts((prev) =>
          prev.map((t) => (t.id === item.id ? { ...t, phase: "exiting" } : t)),
        );

        // 动画结束后真正移除
        const removeTimer = setTimeout(() => {
          timersRef.current.delete(removeTimer);
          setToasts((prev) => prev.filter((t) => t.id !== item.id));
        }, TOAST_EXIT_MS);
        timersRef.current.add(removeTimer);
      }, duration);
      timersRef.current.add(exitTimer);
    };

    listeners.push(handler);
    return () => {
      listeners = listeners.filter((fn) => fn !== handler);
      // 清理所有未完成的 timer，避免卸载后 setState
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((item) => {
        const Icon = ICON_MAP[item.level];
        const color = COLOR_MAP[item.level];
        return (
          <div
            key={item.id}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-[var(--panel-bg)] backdrop-blur-[30px] border-[0.5px] border-[var(--panel-border)] shadow-[var(--panel-shadow)] px-4 py-2.5 text-[13px] leading-[16px] text-[var(--label-primary)] select-none transition-all duration-300 ease-out"
            style={
              item.phase === "entering"
                ? { opacity: 0, transform: "translateY(-8px)" }
                : item.phase === "exiting"
                  ? { opacity: 0, transform: "translateY(-4px)" }
                  : { opacity: 1, transform: "translateY(0)" }
            }
          >
            <Icon size={14} className="shrink-0" style={{ color }} />
            <span>{item.message}</span>
          </div>
        );
      })}
    </div>
  );
}
