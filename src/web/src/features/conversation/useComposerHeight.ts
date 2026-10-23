import type { KeyboardEvent, PointerEvent, RefObject } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

interface HeightLimits {
  minimum: number;
  maximum: number;
  defaultHeight: number;
}

/** 编辑高度随可见视口调整，手动选择在当前 Composer 生命周期内保留。 */
export function useComposerHeight(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  surfaceRef: RefObject<HTMLDivElement | null>,
  text: string,
) {
  const [limits, setLimits] = useState<HeightLimits>({
    minimum: 36,
    maximum: 320,
    defaultHeight: 60,
  });
  const [manualHeight, setManualHeight] = useState<number | null>(null);
  const [height, setHeight] = useState(60);
  const [dragging, setDragging] = useState(false);
  const heightRef = useRef(height);
  const limitsRef = useRef(limits);
  const manualRef = useRef(manualHeight);
  const cleanupRef = useRef<(() => void) | null>(null);
  heightRef.current = height;
  limitsRef.current = limits;
  manualRef.current = manualHeight;

  const resizeTextarea = useCallback((element: HTMLTextAreaElement) => {
    const bounds = limitsRef.current;
    element.style.height = "auto";
    const requested =
      manualRef.current ?? Math.max(bounds.defaultHeight, element.scrollHeight);
    const next = Math.min(bounds.maximum, Math.max(bounds.minimum, requested));
    element.style.height = `${next}px`;
    element.style.overflowY = element.scrollHeight > next ? "auto" : "hidden";
    heightRef.current = next;
    setHeight(next);
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const surface = surfaceRef.current;
      const textarea = textareaRef.current;
      const overhead = Math.max(
        0,
        (surface?.getBoundingClientRect().height ?? 0) -
          (textarea?.getBoundingClientRect().height ?? 0),
      );
      const maximum = Math.max(
        36,
        Math.floor(
          Math.min(320, viewportHeight * 0.45, viewportHeight - overhead - 80),
        ),
      );
      const style = textarea ? getComputedStyle(textarea) : null;
      const lineHeight = Number.parseFloat(style?.lineHeight ?? "") || 24;
      const paddingTop = Number.parseFloat(style?.paddingTop ?? "") || 6;
      const paddingBottom = Number.parseFloat(style?.paddingBottom ?? "") || 6;
      const defaultLines =
        Number.parseFloat(
          style?.getPropertyValue("--composer-default-lines") ?? "",
        ) || 2;
      const defaultHeight = Math.ceil(
        lineHeight * defaultLines + paddingTop + paddingBottom,
      );
      setLimits((previous) =>
        previous.maximum === maximum && previous.defaultHeight === defaultHeight
          ? previous
          : { minimum: 36, maximum, defaultHeight },
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (surfaceRef.current) observer?.observe(surfaceRef.current);
    return () => {
      cleanupRef.current?.();
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [surfaceRef, textareaRef]);

  useLayoutEffect(() => {
    if (textareaRef.current) resizeTextarea(textareaRef.current);
  }, [text, limits, manualHeight, resizeTextarea, textareaRef]);

  const resetHeight = useCallback(() => {
    cleanupRef.current?.();
    setDragging(false);
    manualRef.current = null;
    setManualHeight(null);
    if (textareaRef.current) resizeTextarea(textareaRef.current);
  }, [resizeTextarea, textareaRef]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    cleanupRef.current?.();
    const pointerId = event.pointerId;
    const startY = event.clientY;
    const startHeight = heightRef.current;
    const previous = manualRef.current;
    const target = event.currentTarget;
    target.setPointerCapture?.(pointerId);
    setDragging(true);

    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      next.preventDefault();
      const bounds = limitsRef.current;
      const value = Math.min(
        bounds.maximum,
        Math.max(bounds.minimum, startHeight + startY - next.clientY),
      );
      manualRef.current = value;
      setManualHeight(value);
    };
    const finish = (cancelled: boolean) => {
      cleanupRef.current?.();
      setDragging(false);
      if (cancelled) {
        manualRef.current = previous;
        setManualHeight(previous);
      }
    };
    const up = (next: globalThis.PointerEvent) => {
      if (next.pointerId === pointerId) finish(false);
    };
    const cancel = (next: globalThis.PointerEvent) => {
      if (next.pointerId === pointerId) finish(true);
    };
    const key = (next: globalThis.KeyboardEvent) => {
      if (next.key === "Escape") {
        next.preventDefault();
        finish(true);
      }
    };
    const blur = () => finish(true);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", blur);
    target.addEventListener("lostpointercapture", blur);
    cleanupRef.current = () => {
      cleanupRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
      target.removeEventListener("lostpointercapture", blur);
      if (target.hasPointerCapture?.(pointerId))
        target.releasePointerCapture(pointerId);
    };
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Home") {
        event.preventDefault();
        resetHeight();
        return;
      }
      if (!["ArrowUp", "ArrowDown", "End"].includes(event.key)) return;
      event.preventDefault();
      const bounds = limitsRef.current;
      const requested =
        event.key === "End"
          ? bounds.maximum
          : heightRef.current + (event.key === "ArrowUp" ? 24 : -24);
      const next = Math.min(
        bounds.maximum,
        Math.max(bounds.minimum, requested),
      );
      manualRef.current = next;
      setManualHeight(next);
    },
    [resetHeight],
  );

  return {
    height,
    limits,
    dragging,
    resizeTextarea,
    onPointerDown,
    onKeyDown,
    resetHeight,
  };
}
