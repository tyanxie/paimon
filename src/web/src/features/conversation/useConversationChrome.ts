import type { InstanceId } from "@protocol/types";
import { useLayoutEffect, useRef, useState } from "react";
import { getConversationScrollSpacing } from "./utils";

/** 观察对话顶部栏、输入区和 Safe Area 的高度。 */
export function useConversationChrome(instanceId: InstanceId) {
  const topChromeRef = useRef<HTMLDivElement>(null);
  const bottomChromeRef = useRef<HTMLDivElement>(null);
  const bottomSafeGapRef = useRef<HTMLDivElement>(null);
  const [topChromeHeight, setTopChromeHeight] = useState(64);
  const [bottomChromeHeight, setBottomChromeHeight] = useState(96);
  const [bottomSafeGap, setBottomSafeGap] = useState(12);

  useLayoutEffect(() => {
    const observeHeight = (
      element: HTMLElement | null,
      setHeight: (height: number) => void,
    ) => {
      if (!element) return () => undefined;
      const updateHeight = () => {
        setHeight(Math.ceil(element.getBoundingClientRect().height));
      };
      updateHeight();
      if (typeof ResizeObserver === "undefined") return () => undefined;
      const observer = new ResizeObserver(updateHeight);
      observer.observe(element);
      return () => observer.disconnect();
    };

    const cleanupTop = observeHeight(topChromeRef.current, setTopChromeHeight);
    const cleanupBottom = observeHeight(
      bottomChromeRef.current,
      setBottomChromeHeight,
    );
    const cleanupSafeGap = observeHeight(
      bottomSafeGapRef.current,
      setBottomSafeGap,
    );

    return () => {
      cleanupTop();
      cleanupBottom();
      cleanupSafeGap();
    };
  }, [instanceId]);

  return {
    topChromeRef,
    bottomChromeRef,
    bottomSafeGapRef,
    topChromeHeight,
    bottomChromeHeight,
    bottomSafeGap,
    scrollSpacing: getConversationScrollSpacing({
      topChromeHeight,
      bottomChromeHeight,
      bottomSafeGap,
    }),
  };
}
