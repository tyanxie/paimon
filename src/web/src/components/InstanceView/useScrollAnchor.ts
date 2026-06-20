// 滚动锚点管理 hook：anchor pin、prepend restore、bottom follow、load more 触发

import { useRef, useLayoutEffect, useState, useCallback } from "react";
import type { RefObject } from "react";
import type { InstanceId } from "../../../../protocol/types";
import type { SessionEntry } from "../../stores/types";
import { getSessionEntryRenderKey } from "../../stores/types";
import {
  getSafeScrollTop,
  pinScrollToBottomIfNeeded,
  shouldLoadMoreFromScroll,
  calculatePrependScrollTop,
} from "./utils";

const LOAD_MORE_SUPPRESS_MS = 350;
const ENTRY_KEY_ATTR = "data-entry-key";
const ANCHOR_RESTORE_EPSILON = 0.5;
const ANCHOR_WARMUP_FRAMES = 3;
const BOTTOM_FOLLOW_MS = 2000;

// ─── 类型 ───────────────────────────────────────────────────────

interface ScrollAnchorSnapshot {
  entryKey?: string;
  element?: Element;
  elementTop?: number;
  entryTop?: number;
  fallbackScrollTop: number;
  fallbackScrollHeight: number;
}

interface AnchorRestoreResult {
  mode: "deep" | "entry" | "diff" | "none";
  delta: number;
  adjusted: boolean;
}

interface AnchorPinSession {
  snapshot: ScrollAnchorSnapshot;
  observer: ResizeObserver | null;
  rafId: number | null;
  warmupFrame: number;
}

export interface UseScrollAnchorOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  bottomChromeRef: RefObject<HTMLDivElement | null>;
  entries: SessionEntry[];
  entriesRef: RefObject<SessionEntry[]>;
  instanceId: InstanceId | null;
  hasMore: boolean;
  shouldScrollToBottom: boolean;
  onScrollToBottomHandled: () => void;
  onLoadMore?: () => void;
  bottomChromeHeight: number;
  bottomSafeGap: number;
}

export interface UseScrollAnchorReturn {
  handleScroll: () => void;
  scrollToBottom: () => void;
  showScrollBtn: boolean;
  startBottomFollow: () => void;
}

// ─── DOM 工具函数 ────────────────────────────────────────────────

function getEntryKey(entryElement: Element) {
  return entryElement.getAttribute(ENTRY_KEY_ATTR) ?? undefined;
}

function getEntryElementFromElement(container: HTMLElement, element: Element) {
  const entryElement = element.closest<HTMLElement>(`[${ENTRY_KEY_ATTR}]`);
  if (!entryElement || !container.contains(entryElement)) return null;
  return entryElement;
}

function findEntryElementByKey(container: HTMLElement, entryKey: string) {
  const entryElements = container.querySelectorAll<HTMLElement>(
    `[${ENTRY_KEY_ATTR}]`,
  );
  for (const entryElement of entryElements) {
    if (getEntryKey(entryElement) === entryKey) return entryElement;
  }
  return null;
}

function getRelativeTop(containerRect: DOMRect, element: Element) {
  return element.getBoundingClientRect().top - containerRect.top;
}

function findFirstVisibleEntry(container: HTMLElement) {
  const containerRect = container.getBoundingClientRect();
  const thresholdTop = containerRect.top + 8;
  const entryElements = container.querySelectorAll<HTMLElement>(
    `[${ENTRY_KEY_ATTR}]`,
  );

  for (const entryElement of entryElements) {
    const rect = entryElement.getBoundingClientRect();
    if (rect.bottom > thresholdTop && rect.top < containerRect.bottom) {
      return entryElement;
    }
  }

  return null;
}

function captureScrollAnchor(container: HTMLElement): ScrollAnchorSnapshot {
  const snapshot: ScrollAnchorSnapshot = {
    fallbackScrollTop: getSafeScrollTop(container.scrollTop),
    fallbackScrollHeight: container.scrollHeight,
  };
  const containerRect = container.getBoundingClientRect();
  const entryElement = findFirstVisibleEntry(container);
  if (!entryElement) return snapshot;

  const entryKey = getEntryKey(entryElement);
  if (!entryKey) return snapshot;

  const entryRect = entryElement.getBoundingClientRect();
  const probeY = Math.min(
    Math.max(containerRect.top + 12, entryRect.top + 8),
    Math.min(entryRect.bottom - 1, containerRect.bottom - 1),
  );
  const points = [
    {
      x: containerRect.left + containerRect.width / 2,
      y: probeY,
    },
    { x: containerRect.left + 24, y: probeY },
    { x: containerRect.right - 24, y: probeY },
  ];

  for (const point of points) {
    const elements = document.elementsFromPoint(point.x, point.y);
    for (const element of elements) {
      if (element === container || !container.contains(element)) continue;

      const deepEntryElement = getEntryElementFromElement(container, element);
      if (!deepEntryElement || deepEntryElement !== entryElement) continue;

      const elementRect = element.getBoundingClientRect();
      if (
        elementRect.bottom <= containerRect.top ||
        elementRect.top >= containerRect.bottom
      ) {
        continue;
      }

      return {
        ...snapshot,
        entryKey,
        element,
        elementTop: getRelativeTop(containerRect, element),
        entryTop: getRelativeTop(containerRect, entryElement),
      };
    }
  }

  return {
    ...snapshot,
    entryKey,
    entryTop: getRelativeTop(containerRect, entryElement),
  };
}

function applyScrollDelta(container: HTMLElement, delta: number) {
  if (Math.abs(delta) <= ANCHOR_RESTORE_EPSILON) {
    return false;
  }
  container.scrollTop += delta;
  return true;
}

function restoreScrollAnchor(
  container: HTMLElement,
  snapshot: ScrollAnchorSnapshot,
  { allowDiffFallback }: { allowDiffFallback: boolean },
): AnchorRestoreResult {
  const containerRect = container.getBoundingClientRect();

  if (
    snapshot.element &&
    snapshot.elementTop != null &&
    snapshot.element.isConnected &&
    container.contains(snapshot.element)
  ) {
    const entryElement = getEntryElementFromElement(
      container,
      snapshot.element,
    );
    const entryKey = entryElement ? getEntryKey(entryElement) : undefined;
    if (!snapshot.entryKey || entryKey === snapshot.entryKey) {
      const delta =
        getRelativeTop(containerRect, snapshot.element) - snapshot.elementTop;
      return {
        mode: "deep",
        delta,
        adjusted: applyScrollDelta(container, delta),
      };
    }
  }

  if (snapshot.entryKey && snapshot.entryTop != null) {
    const entryElement = findEntryElementByKey(container, snapshot.entryKey);
    if (entryElement) {
      const delta =
        getRelativeTop(containerRect, entryElement) - snapshot.entryTop;
      return {
        mode: "entry",
        delta,
        adjusted: applyScrollDelta(container, delta),
      };
    }
  }

  if (allowDiffFallback) {
    const targetTop = calculatePrependScrollTop({
      previousScrollTop: snapshot.fallbackScrollTop,
      previousScrollHeight: snapshot.fallbackScrollHeight,
      nextScrollHeight: container.scrollHeight,
    });
    const delta = targetTop - container.scrollTop;
    container.scrollTop = targetTop;
    return {
      mode: "diff",
      delta,
      adjusted: Math.abs(delta) > ANCHOR_RESTORE_EPSILON,
    };
  }

  return { mode: "none", delta: 0, adjusted: false };
}

// ─── Hook ────────────────────────────────────────────────────────

export function useScrollAnchor({
  scrollRef,
  contentRef,
  bottomChromeRef,
  entries,
  entriesRef,
  instanceId,
  hasMore,
  shouldScrollToBottom,
  onScrollToBottomHandled,
  onLoadMore,
  bottomChromeHeight,
  bottomSafeGap,
}: UseScrollAnchorOptions): UseScrollAnchorReturn {
  const isAtBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // 标记正在调整 scroll 位置（prepend 场景），期间不更新 isAtBottom
  const adjustingScrollRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const programmaticScrollFrameRef = useRef<number | null>(null);
  const bottomFollowCancelRef = useRef<(() => void) | null>(null);

  // 加载更多：滚动到顶部触发
  const loadingMoreRef = useRef(false);
  const loadMoreAnchorRef = useRef<ScrollAnchorSnapshot | null>(null);
  const prevEntriesLengthRef = useRef(entries.length);
  const firstEntryKeyBeforeLoadRef = useRef<string | undefined>(undefined);
  const suppressLoadMoreUntilRef = useRef(0);
  const anchorPinRef = useRef<AnchorPinSession | null>(null);

  const runProgrammaticScroll = useCallback((action: () => void) => {
    if (programmaticScrollFrameRef.current != null) {
      cancelAnimationFrame(programmaticScrollFrameRef.current);
    }

    programmaticScrollRef.current = true;
    adjustingScrollRef.current = true;
    action();

    programmaticScrollFrameRef.current = requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
      adjustingScrollRef.current = false;
      programmaticScrollFrameRef.current = null;
    });
  }, []);

  const stopAnchorPin = useCallback(() => {
    const session = anchorPinRef.current;
    if (!session) return;

    if (session.rafId != null) {
      cancelAnimationFrame(session.rafId);
    }
    session.observer?.disconnect();
    anchorPinRef.current = null;
  }, []);

  const pinToBottom = useCallback(
    ({ force = false }: { force?: boolean } = {}) => {
      const el = scrollRef.current;
      const contentEl = contentRef.current;
      const bottomEl = bottomChromeRef.current;
      if (!el || !contentEl || !bottomEl) return false;

      const entryElements = contentEl.querySelectorAll<HTMLElement>(
        `[${ENTRY_KEY_ATTR}]`,
      );
      const lastEntryEl = entryElements[entryElements.length - 1];
      const lastEntryRect = lastEntryEl?.getBoundingClientRect();
      const bottomRect = bottomEl.getBoundingClientRect();
      const distanceToBottom =
        el.scrollHeight - getSafeScrollTop(el.scrollTop) - el.clientHeight;
      const overlap = lastEntryRect ? lastEntryRect.bottom - bottomRect.top : 0;

      return pinScrollToBottomIfNeeded({
        isAtBottom: isAtBottomRef.current,
        isLoadingMore: loadingMoreRef.current,
        distanceToBottom,
        overlap,
        force,
        scrollToBottom: () => {
          stopAnchorPin();
          runProgrammaticScroll(() => {
            el.scrollTop = el.scrollHeight;
          });
          setShowScrollBtn(false);
        },
      });
    },
    [
      scrollRef,
      contentRef,
      bottomChromeRef,
      runProgrammaticScroll,
      stopAnchorPin,
    ],
  );

  const stopBottomFollow = useCallback(() => {
    bottomFollowCancelRef.current?.();
    bottomFollowCancelRef.current = null;
  }, []);

  const startBottomFollow = useCallback(() => {
    stopBottomFollow();

    const startedAt = performance.now();
    let frameId: number | null = null;
    let cancelled = false;

    const run = (timestamp = performance.now()) => {
      frameId = null;
      if (cancelled || timestamp - startedAt >= BOTTOM_FOLLOW_MS) return;
      if (!isAtBottomRef.current || loadingMoreRef.current) return;

      pinToBottom();
      frameId = requestAnimationFrame(run);
    };

    run();

    bottomFollowCancelRef.current = () => {
      cancelled = true;
      if (frameId != null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    };
  }, [pinToBottom, stopBottomFollow]);

  useLayoutEffect(() => {
    if (loadingMoreRef.current) return;
    pinToBottom();
  }, [bottomChromeHeight, bottomSafeGap, pinToBottom]);

  useLayoutEffect(() => {
    const contentEl = contentRef.current;
    if (!contentEl || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      pinToBottom();
    });
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [instanceId, contentRef, pinToBottom]);

  const restorePinnedAnchor = useCallback(() => {
    const el = scrollRef.current;
    const session = anchorPinRef.current;
    if (!el || !session) return;

    let result: AnchorRestoreResult = {
      mode: "none",
      delta: 0,
      adjusted: false,
    };
    runProgrammaticScroll(() => {
      result = restoreScrollAnchor(el, session.snapshot, {
        allowDiffFallback: false,
      });
    });

    if (result.mode === "none") {
      stopAnchorPin();
    }
  }, [scrollRef, runProgrammaticScroll, stopAnchorPin]);

  const schedulePinnedAnchorRestore = useCallback(() => {
    const session = anchorPinRef.current;
    if (!session || session.rafId != null) return;

    session.rafId = requestAnimationFrame(() => {
      const current = anchorPinRef.current;
      if (!current || current !== session) return;

      current.rafId = null;
      restorePinnedAnchor();
    });
  }, [restorePinnedAnchor]);

  const startAnchorPin = useCallback(
    (snapshot: ScrollAnchorSnapshot) => {
      const el = scrollRef.current;
      const contentEl = contentRef.current;
      if (!el || !contentEl || !snapshot.entryKey) return;

      stopAnchorPin();

      const session: AnchorPinSession = {
        snapshot,
        observer: null,
        rafId: null,
        warmupFrame: 0,
      };
      anchorPinRef.current = session;

      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(() => {
          schedulePinnedAnchorRestore();
        });
        observer.observe(contentEl);
        const entryElement = findEntryElementByKey(el, snapshot.entryKey);
        if (entryElement && entryElement !== contentEl) {
          observer.observe(entryElement);
        }
        session.observer = observer;
      }

      const runWarmup = () => {
        const current = anchorPinRef.current;
        if (!current || current !== session) return;
        if (current.warmupFrame >= ANCHOR_WARMUP_FRAMES) return;

        current.rafId = requestAnimationFrame(() => {
          const latest = anchorPinRef.current;
          if (!latest || latest !== session) return;

          latest.rafId = null;
          latest.warmupFrame += 1;
          restorePinnedAnchor();
          runWarmup();
        });
      };

      runWarmup();
    },
    [
      scrollRef,
      contentRef,
      restorePinnedAnchor,
      schedulePinnedAnchorRestore,
      stopAnchorPin,
    ],
  );

  // 实例切换时重置所有状态
  useLayoutEffect(() => {
    loadingMoreRef.current = false;
    loadMoreAnchorRef.current = null;
    firstEntryKeyBeforeLoadRef.current = undefined;
    suppressLoadMoreUntilRef.current = 0;
    prevEntriesLengthRef.current = entriesRef.current.length;
    isAtBottomRef.current = true;
    setShowScrollBtn(false);

    return () => {
      stopBottomFollow();
      stopAnchorPin();
      if (programmaticScrollFrameRef.current != null) {
        cancelAnimationFrame(programmaticScrollFrameRef.current);
        programmaticScrollFrameRef.current = null;
      }
      programmaticScrollRef.current = false;
      adjustingScrollRef.current = false;
      loadingMoreRef.current = false;
      loadMoreAnchorRef.current = null;
      firstEntryKeyBeforeLoadRef.current = undefined;
      suppressLoadMoreUntilRef.current = 0;
    };
  }, [instanceId, entriesRef, stopAnchorPin, stopBottomFollow]);

  // 此 effect 需要先于 prepend restore 执行，依赖 loadingMoreRef 在本轮渲染中尚未被清除。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (loadingMoreRef.current) {
      return;
    }

    pinToBottom();
  }, [entries, instanceId, scrollRef, pinToBottom]);

  useLayoutEffect(() => {
    if (!shouldScrollToBottom) return;

    const el = scrollRef.current;
    if (!el) {
      onScrollToBottomHandled();
      return;
    }

    isAtBottomRef.current = true;
    pinToBottom({ force: true });
    setShowScrollBtn(false);
    onScrollToBottomHandled();
  }, [
    shouldScrollToBottom,
    entries,
    scrollRef,
    pinToBottom,
    onScrollToBottomHandled,
  ]);

  // entries 变化后：调整滚动位置 + 重置 loading 状态
  useLayoutEffect(() => {
    const el = scrollRef.current;

    if (
      loadingMoreRef.current &&
      el &&
      entries.length > prevEntriesLengthRef.current
    ) {
      const currentFirstKey = entries[0]
        ? getSessionEntryRenderKey(entries[0])
        : undefined;
      const didPrepend =
        !firstEntryKeyBeforeLoadRef.current ||
        currentFirstKey !== firstEntryKeyBeforeLoadRef.current;

      if (didPrepend) {
        const snapshot = loadMoreAnchorRef.current;
        let result: AnchorRestoreResult = {
          mode: "none",
          delta: 0,
          adjusted: false,
        };

        if (snapshot) {
          runProgrammaticScroll(() => {
            result = restoreScrollAnchor(el, snapshot, {
              allowDiffFallback: true,
            });
          });
        }

        suppressLoadMoreUntilRef.current =
          performance.now() + LOAD_MORE_SUPPRESS_MS;

        if (snapshot && snapshot.entryKey && result.mode !== "none") {
          startAnchorPin(snapshot);
        }

        loadingMoreRef.current = false;
        loadMoreAnchorRef.current = null;
        firstEntryKeyBeforeLoadRef.current = undefined;
      } else {
        // 等待 history 响应期间如果只是底部新增消息，更新 fallback 基准高度，避免后续 diff fallback 过度补偿
        if (loadMoreAnchorRef.current) {
          loadMoreAnchorRef.current = {
            ...loadMoreAnchorRef.current,
            fallbackScrollHeight: el.scrollHeight,
          };
        }
      }
    }

    if (loadingMoreRef.current && !hasMore) {
      loadingMoreRef.current = false;
      loadMoreAnchorRef.current = null;
      firstEntryKeyBeforeLoadRef.current = undefined;
    }

    prevEntriesLengthRef.current = entries.length;
  }, [
    entries,
    hasMore,
    instanceId,
    scrollRef,
    runProgrammaticScroll,
    startAnchorPin,
  ]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const rawScrollTop = el.scrollTop;
    const safeScrollTop = getSafeScrollTop(rawScrollTop);
    const isSuppressed = performance.now() < suppressLoadMoreUntilRef.current;

    if (rawScrollTop < 0) {
      return;
    }

    // 调整 scroll 位置期间不更新 isAtBottom 状态，也不把程序化滚动误判为用户滚动
    if (adjustingScrollRef.current || programmaticScrollRef.current) {
      return;
    }

    if (anchorPinRef.current) {
      stopAnchorPin();
    }

    // 检测是否在底部（60px 容差）
    const atBottom = el.scrollHeight - safeScrollTop - el.clientHeight < 60;
    isAtBottomRef.current = atBottom;
    if (!atBottom) {
      stopBottomFollow();
    }
    setShowScrollBtn(!atBottom);

    const willLoadMore = shouldLoadMoreFromScroll({
      rawScrollTop,
      hasMore,
      canLoadMore: !!onLoadMore,
      isLoadingMore: loadingMoreRef.current,
      isSuppressed,
    });

    // 滚动到顶部加载更多
    if (willLoadMore && onLoadMore) {
      stopBottomFollow();
      stopAnchorPin();
      loadingMoreRef.current = true;
      const currentEntries = entriesRef.current;
      const snapshot = captureScrollAnchor(el);
      loadMoreAnchorRef.current = snapshot;
      firstEntryKeyBeforeLoadRef.current = currentEntries[0]
        ? getSessionEntryRenderKey(currentEntries[0])
        : undefined;
      onLoadMore();
    }
  }, [
    scrollRef,
    entriesRef,
    hasMore,
    onLoadMore,
    stopAnchorPin,
    stopBottomFollow,
  ]);

  // 快速滚动到底部
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      stopAnchorPin();
      runProgrammaticScroll(() => {
        scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight;
      });
      isAtBottomRef.current = true;
      setShowScrollBtn(false);
    }
  }, [scrollRef, runProgrammaticScroll, stopAnchorPin]);

  return {
    handleScroll,
    scrollToBottom,
    showScrollBtn,
    startBottomFollow,
  };
}
