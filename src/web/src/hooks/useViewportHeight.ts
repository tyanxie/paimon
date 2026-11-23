// iOS Safari 键盘弹出时动态调整视口高度
// Safari 不完全支持 interactive-widget=resizes-content，需要 JS 降级

import { useEffect } from "react";

export function useViewportHeight(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;

    function update() {
      if (!viewport) return;
      const diff = window.innerHeight - viewport.height;
      // 局部放大只改变可见范围，不应触发键盘适配或强制滚动
      if (viewport.scale > 1) {
        root.style.removeProperty("--app-viewport-height");
        root.style.removeProperty("--app-viewport-top");
      } else if (diff > 1) {
        root.style.setProperty("--app-viewport-height", `${viewport.height}px`);
        root.style.setProperty("--app-viewport-top", `${viewport.offsetTop}px`);
        if (window.scrollY > 0) {
          window.scrollTo(0, 0);
        }
      } else {
        root.style.removeProperty("--app-viewport-height");
        root.style.removeProperty("--app-viewport-top");
      }
    }

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--app-viewport-height");
      root.style.removeProperty("--app-viewport-top");
    };
  }, []);
}
