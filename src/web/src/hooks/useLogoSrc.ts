import {
  useBackground,
  useResolvedTheme,
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
