import {
  useBackground,
  useResolvedTheme,
  useSettings,
  type Background,
} from "../stores/useSettings";

// 路径规则与 src/web/index.html 中的 preload 内联脚本一致
const FALLBACK_LOGO_SRC = "/logos/mist/light/paimon-logo.png";

export function getLogoSrc(
  background: Background | undefined,
  theme: "light" | "dark" | undefined,
) {
  if (!background || !theme) return FALLBACK_LOGO_SRC;
  return `/logos/${background}/${theme}/paimon-logo.png`;
}

export function useLogoSrc() {
  const [background] = useBackground();
  const theme = useResolvedTheme();
  return getLogoSrc(background, theme);
}

/** 非 React 上下文中获取当前 logo 路径（快照式，无订阅） */
export function getCurrentLogoSrc(): string {
  const { background, resolvedTheme } = useSettings.getState();
  return getLogoSrc(background, resolvedTheme);
}
