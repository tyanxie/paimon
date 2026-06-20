// 设置 store：Zustand + localStorage 持久化 + DOM 属性同步

import { create } from "zustand";

// ── 类型 ──

export type Appearance = "light" | "dark" | "system";
export type Background = "mist" | "aurora" | "ember";

interface SettingsState {
  appearance: Appearance;
  background: Background;
  /** 解析后的实际主题（考虑 system 偏好） */
  resolvedTheme: "light" | "dark";
  setAppearance: (value: Appearance) => void;
  setBackground: (value: Background) => void;
}

// ── 常量 ──

const KEYS = {
  appearance: "paimon:appearance",
  background: "paimon:background",
} as const;

// ── localStorage 读取 ──

function readAppearance(): Appearance {
  const val = localStorage.getItem(KEYS.appearance);
  if (val === "light" || val === "dark" || val === "system") return val;
  return "system";
}

function readBackground(): Background {
  const val = localStorage.getItem(KEYS.background);
  if (val === "mist" || val === "aurora" || val === "ember") return val;
  return "mist";
}

// ── DOM 同步 ──

function resolveTheme(appearance: Appearance): "light" | "dark" {
  if (appearance === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return appearance;
}

function syncDOM(appearance: Appearance, background: Background) {
  const theme = resolveTheme(appearance);
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-bg", background);
  return theme;
}

// ── Store ──

export const useSettings = create<SettingsState>((set) => ({
  appearance: readAppearance(),
  background: readBackground(),
  resolvedTheme: resolveTheme(readAppearance()),

  setAppearance: (value) => {
    localStorage.setItem(KEYS.appearance, value);
    const resolvedTheme = syncDOM(value, useSettings.getState().background);
    set({ appearance: value, resolvedTheme });
  },

  setBackground: (value) => {
    localStorage.setItem(KEYS.background, value);
    syncDOM(useSettings.getState().appearance, value);
    set({ background: value });
  },
}));

// ── 系统主题变化监听 ──

const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
mediaQuery.addEventListener("change", () => {
  const { appearance, background } = useSettings.getState();
  if (appearance === "system") {
    const resolvedTheme = syncDOM(appearance, background);
    useSettings.setState({ resolvedTheme });
  }
});

// ── 兼容 hooks（保持现有消费者 API 不变）──

export function useAppearance(): [Appearance, (v: Appearance) => void] {
  const appearance = useSettings((s) => s.appearance);
  const setAppearance = useSettings((s) => s.setAppearance);
  return [appearance, setAppearance];
}

export function useBackground(): [Background, (v: Background) => void] {
  const background = useSettings((s) => s.background);
  const setBackground = useSettings((s) => s.setBackground);
  return [background, setBackground];
}

export function useResolvedTheme(): "light" | "dark" {
  return useSettings((s) => s.resolvedTheme);
}

// ── 初始化（模块加载时同步 DOM）──

syncDOM(readAppearance(), readBackground());
