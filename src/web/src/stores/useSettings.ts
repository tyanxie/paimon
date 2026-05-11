// 设置 store：localStorage 读写 + DOM 属性同步 + React reactive

import { useSyncExternalStore } from "react";

// ========================================
// 类型
// ========================================

export type Appearance = "light" | "dark" | "system";
export type Background = "mist" | "aurora" | "ember";
export type MessageRenderMode = "raw" | "rich";

// ========================================
// 常量
// ========================================

const KEYS = {
  appearance: "paimon:appearance",
  background: "paimon:background",
  messageRenderMode: "paimon:messageRenderMode",
} as const;

const DEFAULTS = {
  appearance: "system" as Appearance,
  background: "mist" as Background,
  messageRenderMode: "rich" as MessageRenderMode,
} as const;

// ========================================
// 内部状态 + 订阅机制
// ========================================

let listeners: Set<() => void> = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ========================================
// localStorage 读写
// ========================================

function getAppearance(): Appearance {
  const val = localStorage.getItem(KEYS.appearance);
  if (val === "light" || val === "dark" || val === "system") return val;
  return DEFAULTS.appearance;
}

function getBackground(): Background {
  const val = localStorage.getItem(KEYS.background);
  if (val === "mist" || val === "aurora" || val === "ember") return val;
  return DEFAULTS.background;
}

function getMessageRenderMode(): MessageRenderMode {
  const val = localStorage.getItem(KEYS.messageRenderMode);
  if (val === "raw" || val === "rich") return val;
  return DEFAULTS.messageRenderMode;
}

// ========================================
// DOM 属性同步
// ========================================

let mediaQuery: MediaQueryList | null = null;
let mediaHandler: ((e: MediaQueryListEvent) => void) | null = null;

function resolveTheme(appearance: Appearance): "light" | "dark" {
  if (appearance === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return appearance;
}

function syncDOM() {
  const appearance = getAppearance();
  const background = getBackground();
  const theme = resolveTheme(appearance);

  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-bg", background);

  // matchMedia 监听管理
  if (appearance === "system") {
    if (!mediaQuery) {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaHandler = () => {
        const newTheme = resolveTheme("system");
        document.documentElement.setAttribute("data-theme", newTheme);
        emit();
      };
      mediaQuery.addEventListener("change", mediaHandler);
    }
  } else {
    if (mediaQuery && mediaHandler) {
      mediaQuery.removeEventListener("change", mediaHandler);
      mediaQuery = null;
      mediaHandler = null;
    }
  }
}

// ========================================
// 公开方法
// ========================================

export function setAppearance(value: Appearance) {
  localStorage.setItem(KEYS.appearance, value);
  syncDOM();
  emit();
}

export function setBackground(value: Background) {
  localStorage.setItem(KEYS.background, value);
  syncDOM();
  emit();
}

export function setMessageRenderMode(value: MessageRenderMode) {
  localStorage.setItem(KEYS.messageRenderMode, value);
  emit();
}

// ========================================
// React Hooks
// ========================================

export function useAppearance(): [Appearance, (v: Appearance) => void] {
  const value = useSyncExternalStore(subscribe, getAppearance);
  return [value, setAppearance];
}

export function useBackground(): [Background, (v: Background) => void] {
  const value = useSyncExternalStore(subscribe, getBackground);
  return [value, setBackground];
}

export function useMessageRenderMode(): [
  MessageRenderMode,
  (v: MessageRenderMode) => void,
] {
  const value = useSyncExternalStore(subscribe, getMessageRenderMode);
  return [value, setMessageRenderMode];
}

/** 获取当前解析后的实际主题（light/dark） */
export function useResolvedTheme(): "light" | "dark" {
  return useSyncExternalStore(subscribe, () => resolveTheme(getAppearance()));
}

// ========================================
// 初始化（首次加载时同步 DOM）
// ========================================

syncDOM();
