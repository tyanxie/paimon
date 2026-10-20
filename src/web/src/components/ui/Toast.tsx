// 浮动提示保留等级与持续时间，使用独立的非模态显示层。
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  LazyMotion,
  domAnimation,
  MotionConfigContext,
  useReducedMotion,
} from "motion/react";
import * as m from "motion/react-m";
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
  phase: "entering" | "visible" | "exiting";
}
let toastId = 0;
let listeners: Array<(toast: ToastItem) => void> = [];
export function showToast(message: string, level: ToastLevel = "info") {
  const item: ToastItem = { id: ++toastId, message, level, phase: "entering" };
  listeners.forEach((listener) => listener(item));
}
const TOAST_ENTER_MS = 16;
const TOAST_EXIT_MS = 150;
const DURATION_MAP: Record<ToastLevel, number> = {
  info: 3000,
  success: 3000,
  warning: 4000,
  error: 5000,
};
const ICON_MAP: Record<ToastLevel, LucideIcon> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};
const COLOR_MAP: Record<ToastLevel, string> = {
  info: "var(--toast-icon-info)",
  success: "var(--toast-icon-success)",
  warning: "var(--toast-icon-warning)",
  error: "var(--toast-icon-error)",
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const policy = useContext(MotionConfigContext).reducedMotion;
  const reducedMotion = useReducedMotion() || policy === "always";

  useEffect(() => {
    function schedule(callback: () => void, delay: number) {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        callback();
      }, delay);
      timersRef.current.add(timer);
    }
    const handler = (item: ToastItem) => {
      setToasts((previous) => [...previous, item]);
      schedule(
        () =>
          setToasts((previous) =>
            previous.map((toast) =>
              toast.id === item.id ? { ...toast, phase: "visible" } : toast,
            ),
          ),
        TOAST_ENTER_MS,
      );
      schedule(() => {
        setToasts((previous) =>
          previous.map((toast) =>
            toast.id === item.id ? { ...toast, phase: "exiting" } : toast,
          ),
        );
        schedule(
          () =>
            setToasts((previous) =>
              previous.filter((toast) => toast.id !== item.id),
            ),
          TOAST_EXIT_MS,
        );
      }, DURATION_MAP[item.level]);
    };
    listeners.push(handler);
    return () => {
      listeners = listeners.filter((listener) => listener !== handler);
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof container.showPopover !== "function") {
      container.removeAttribute("popover");
      return;
    }
    // 新提示进入 top layer，保持原生 dialog 打开期间的可见性。
    container.hidePopover();
    container.showPopover();
    return () => container.hidePopover();
  }, [toasts.length]);

  if (!toasts.length) return null;
  return createPortal(
    <LazyMotion features={domAnimation} strict>
      <div ref={containerRef} popover="manual" className="toast-container">
        {toasts.map((item) => {
          const Icon = ICON_MAP[item.level];
          const visible =
            item.phase === "visible" ||
            (reducedMotion && item.phase === "entering");
          return (
            <m.div
              key={item.id}
              role={item.level === "error" ? "alert" : "status"}
              aria-atomic="true"
              className="ui-toast"
              initial={false}
              animate={{
                opacity: visible ? 1 : 0,
                y: reducedMotion || visible ? 0 : -6,
              }}
              transition={{ duration: reducedMotion ? 0 : 0.15 }}
            >
              <Icon
                size={18}
                className="mt-0.5 shrink-0"
                style={{ color: COLOR_MAP[item.level] }}
                aria-hidden="true"
              />
              <span className="min-w-0 whitespace-pre-wrap">
                {item.message}
              </span>
            </m.div>
          );
        })}
      </div>
    </LazyMotion>,
    document.body,
  );
}
