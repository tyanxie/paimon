// 轻量 Toast 提示组件
// macOS 26 Notification 风格：浮动毛玻璃面板 + 滑入/淡出动画

import { useEffect, useState } from "react";

export interface ToastItem {
  id: number;
  message: string;
  /** 动画阶段：entering → visible → exiting */
  phase: "entering" | "visible" | "exiting";
}

let toastId = 0;
let listeners: Array<(toast: ToastItem) => void> = [];

/** 全局触发一条 toast */
export function showToast(message: string) {
  const item: ToastItem = { id: ++toastId, message, phase: "entering" };
  listeners.forEach((fn) => fn(item));
}

const TOAST_ENTER_MS = 16; // 一帧后切换到 visible 触发 CSS transition
const TOAST_DURATION_MS = 3000;
const TOAST_EXIT_MS = 300;

/** Toast 容器，放在 App 顶层即可 */
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (item: ToastItem) => {
      setToasts((prev) => [...prev, item]);

      // 入场：下一帧切到 visible 触发 transition
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === item.id ? { ...t, phase: "visible" } : t)),
        );
      }, TOAST_ENTER_MS);

      // 到时间后进入退出动画
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === item.id ? { ...t, phase: "exiting" } : t)),
        );

        // 动画结束后真正移除
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== item.id));
        }, TOAST_EXIT_MS);
      }, TOAST_DURATION_MS);
    };

    listeners.push(handler);
    return () => {
      listeners = listeners.filter((fn) => fn !== handler);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((item) => (
        <div
          key={item.id}
          className="pointer-events-auto rounded-full bg-[var(--panel-bg)] backdrop-blur-[30px] border-[0.5px] border-[var(--panel-border)] shadow-[var(--panel-shadow)] px-5 py-2.5 text-[13px] leading-[16px] text-[var(--label-primary)] select-none transition-all duration-300 ease-out"
          style={
            item.phase === "entering"
              ? { opacity: 0, transform: "translateY(-8px)" }
              : item.phase === "exiting"
                ? { opacity: 0, transform: "translateY(-4px)" }
                : { opacity: 1, transform: "translateY(0)" }
          }
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
