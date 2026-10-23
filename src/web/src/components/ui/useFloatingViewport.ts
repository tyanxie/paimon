import { useLayoutEffect, useState } from "react";

export function useFloatingViewport(active: boolean) {
  function readViewport() {
    const viewport = window.visualViewport;
    return {
      top: viewport?.offsetTop ?? 0,
      left: viewport?.offsetLeft ?? 0,
      width: viewport?.width ?? window.innerWidth,
      height: viewport?.height ?? window.innerHeight,
    };
  }
  const [bounds, setBounds] = useState(readViewport);
  useLayoutEffect(() => {
    if (!active) return;
    function update() {
      const next = readViewport();
      setBounds((current) =>
        current.top === next.top &&
        current.left === next.left &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
    }
    update();
    const viewport = window.visualViewport;
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, [active]);
  return bounds;
}
