// 事件流画布：展示选中实例的对话 entries

import { useRef, useLayoutEffect, useState, useCallback } from "react";
import { ArrowUp, Square, ChevronsDown } from "lucide-react";
import type {
  InstanceId,
  ContextUsageInfo,
  ModelInfo,
  ThinkingLevel,
  SessionListItem,
  InstanceStatus,
} from "../../../protocol/types";
import {
  getSessionEntryRenderKey,
  type ConversationLoadState,
  type SessionEntry,
} from "../stores/useAppState";
import { useLogoSrc } from "../hooks/useLogoSrc";
import { isStreaming as isStatusStreaming, isBusy } from "../utils/status";
import { EntryItem } from "./entries";
import { MobileNavBar } from "./ui/MobileNavBar";
import { InstanceHeader } from "./ui/InstanceHeader";
import { ModelSelector } from "./ui/ModelSelector";
import { ThinkingSelector } from "./ui/ThinkingSelector";
import { SessionPopover } from "./ui/SessionPopover";

const LOAD_MORE_SUPPRESS_MS = 350;
const ENTRY_KEY_ATTR = "data-entry-key";
const ANCHOR_RESTORE_EPSILON = 0.5;
const ANCHOR_WARMUP_FRAMES = 3;
const BOTTOM_FOLLOW_MS = 2000;
const BOTTOM_FOLLOW_EPSILON = 0.5;

export function getConversationScrollSpacing({
  topChromeHeight,
  bottomChromeHeight,
  bottomSafeGap = 0,
}: {
  topChromeHeight: number;
  bottomChromeHeight: number;
  bottomSafeGap?: number;
}) {
  const bottomChromeAboveViewport = Math.max(
    0,
    bottomChromeHeight - bottomSafeGap,
  );
  const paddingBottom = Math.max(40, bottomChromeAboveViewport + 12);

  return {
    paddingTop: Math.max(24, topChromeHeight - 4),
    paddingBottom,
    scrollButtonBottom: bottomSafeGap + paddingBottom,
  };
}

export function calculatePrependScrollTop({
  previousScrollTop,
  previousScrollHeight,
  nextScrollHeight,
}: {
  previousScrollTop: number;
  previousScrollHeight: number;
  nextScrollHeight: number;
}) {
  return previousScrollTop + nextScrollHeight - previousScrollHeight;
}

export function getComposerButtonMode({
  instanceStatus,
}: {
  instanceStatus?: InstanceStatus;
  inputValue: string;
}) {
  return isStatusStreaming(instanceStatus) ? "stop" : "send";
}

export function getSafeScrollTop(rawScrollTop: number) {
  return Math.max(0, rawScrollTop);
}

export function pinScrollToBottomIfNeeded({
  isAtBottom,
  isLoadingMore,
  distanceToBottom,
  overlap,
  force = false,
  scrollToBottom,
}: {
  isAtBottom: boolean;
  isLoadingMore: boolean;
  distanceToBottom: number;
  overlap: number;
  force?: boolean;
  scrollToBottom: () => void;
}) {
  if (!isAtBottom || isLoadingMore) return false;
  if (!force && distanceToBottom <= BOTTOM_FOLLOW_EPSILON && overlap <= 0) {
    return false;
  }

  scrollToBottom();
  return true;
}

export function shouldLoadMoreFromScroll({
  rawScrollTop,
  hasMore,
  canLoadMore,
  isLoadingMore,
  isSuppressed,
}: {
  rawScrollTop: number;
  hasMore: boolean;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  isSuppressed: boolean;
}) {
  return (
    rawScrollTop >= 0 &&
    getSafeScrollTop(rawScrollTop) < 100 &&
    hasMore &&
    canLoadMore &&
    !isLoadingMore &&
    !isSuppressed
  );
}

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

interface EventStreamProps {
  entries: SessionEntry[];
  instanceId: InstanceId | null;
  isStreaming: boolean;
  loadState: ConversationLoadState;
  errorMessage: string | null;
  shouldScrollToBottom: boolean;
  onScrollToBottomHandled: () => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSendMessage: (message: string) => void;
  onAbort: () => void;
  onSetModel?: (provider: string, id: string) => void;
  onSetThinkingLevel?: (level: ThinkingLevel) => void;
  instanceStatus?: InstanceStatus;
  hasMore?: boolean;
  onLoadMore?: () => void;
  contextUsage?: ContextUsageInfo;
  gitBranch?: string | null;
  instanceName?: string;
  instanceModel?: ModelInfo;
  availableModels?: ModelInfo[];
  thinkingLevel?: ThinkingLevel;
  sessionList?: SessionListItem[];
  sessionListLoading?: boolean;
  onListSessions?: () => void;
  onNewSession?: () => void;
  onSwitchSession?: (path: string) => void;
}

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

export function EventStream({
  entries,
  instanceId,
  isStreaming,
  loadState,
  errorMessage,
  shouldScrollToBottom,
  onScrollToBottomHandled,
  inputValue,
  onInputChange,
  onSendMessage,
  onAbort,
  onSetModel,
  onSetThinkingLevel,
  instanceStatus,
  hasMore = false,
  onLoadMore,
  contextUsage,
  gitBranch,
  instanceName,
  instanceModel,
  availableModels,
  thinkingLevel,
  sessionList = [],
  sessionListLoading = false,
  onListSessions,
  onNewSession,
  onSwitchSession,
}: EventStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const topChromeRef = useRef<HTMLDivElement>(null);
  const bottomChromeRef = useRef<HTMLDivElement>(null);
  const bottomSafeGapRef = useRef<HTMLDivElement>(null);
  const logoSrc = useLogoSrc();
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const isRefreshing = loadState === "refreshing";
  const composerButtonMode = getComposerButtonMode({
    instanceStatus,
    inputValue,
  });
  const [topChromeHeight, setTopChromeHeight] = useState(64);
  const [bottomChromeHeight, setBottomChromeHeight] = useState(96);
  const [bottomSafeGap, setBottomSafeGap] = useState(12);
  const scrollSpacing = getConversationScrollSpacing({
    topChromeHeight,
    bottomChromeHeight,
    bottomSafeGap,
  });

  // 自动滚到底部（仅当用户在底部附近时）
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
    [runProgrammaticScroll, stopAnchorPin],
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
  }, [instanceId, pinToBottom]);

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
  }, [runProgrammaticScroll, stopAnchorPin]);

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
    [restorePinnedAnchor, schedulePinnedAnchorRestore, stopAnchorPin],
  );

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
  }, [instanceId, stopAnchorPin, stopBottomFollow]);

  // 此 effect 需要先于 prepend restore 执行，依赖 loadingMoreRef 在本轮渲染中尚未被清除。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (loadingMoreRef.current) {
      return;
    }

    pinToBottom();
  }, [entries, instanceId, pinToBottom]);

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
  }, [shouldScrollToBottom, entries, pinToBottom, onScrollToBottomHandled]);

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
  }, [entries, hasMore, instanceId, runProgrammaticScroll, startAnchorPin]);

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
  }, [hasMore, instanceId, onLoadMore, stopAnchorPin, stopBottomFollow]);

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
  }, [runProgrammaticScroll, stopAnchorPin]);

  const resizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 150);
    el.style.height = `${newHeight}px`;
    el.style.overflowY = el.scrollHeight > 150 ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      resizeTextarea(textareaRef.current);
    }
  }, [inputValue, resizeTextarea]);

  // textarea 自动调整高度
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onInputChange(e.target.value);
      resizeTextarea(e.target);
    },
    [onInputChange, resizeTextarea],
  );

  // 发送消息
  const handleSend = useCallback(() => {
    if (isBusy(instanceStatus) || !inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    startBottomFollow();
  }, [inputValue, instanceStatus, onSendMessage, startBottomFollow]);

  // 键盘事件：Enter 发送，Shift+Enter 换行，IME 组合输入中不触发
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!instanceId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center select-none">
          <img
            src={logoSrc}
            alt="Paimon"
            className="w-16 h-16 mx-auto mb-4 opacity-80"
          />
          <div className="text-[14px] text-[var(--label-tertiary)] tracking-wide">
            守望 · 交互 · 掌控
          </div>
        </div>
      </div>
    );
  }

  const title = instanceName || "Instance";

  // 实例顶栏 props（PC 和移动端共用）
  const instanceHeaderProps = {
    title,
    gitBranch,
    actions:
      onListSessions && onNewSession && onSwitchSession ? (
        <SessionPopover
          sessions={sessionList}
          loading={sessionListLoading}
          disabled={isBusy(instanceStatus)}
          onOpen={onListSessions}
          onNewSession={onNewSession}
          onSwitchSession={onSwitchSession}
        />
      ) : undefined,
  };

  return (
    <div className="relative flex-1 min-w-0 overflow-hidden">
      <main className="absolute inset-0 flex min-h-0 flex-col overflow-hidden">
        {/* 顶部悬浮信息栏 */}
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 px-3 pt-3 md:px-4 md:pt-4">
          <div
            ref={topChromeRef}
            className="glass-panel pointer-events-auto mx-auto w-full max-w-[920px] px-3 py-2 md:px-4 md:py-2.5"
            role="region"
            aria-label="Instance info"
          >
            {/* PC 端：直接展示 InstanceHeader */}
            <div className="hidden md:flex">
              <InstanceHeader {...instanceHeaderProps} />
            </div>
            {/* 移动端：MobileNavBar 壳 + InstanceHeader 内容 */}
            <MobileNavBar>
              <InstanceHeader {...instanceHeaderProps} />
            </MobileNavBar>
          </div>
        </div>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ overflowAnchor: "none" }}
          aria-busy={isRefreshing}
          className="absolute bottom-[var(--bottom-safe-gap)] left-0 right-0 top-6 overflow-y-auto scrollbar-auto px-3 md:bottom-0 md:top-7 md:px-4"
        >
          <div
            ref={contentRef}
            style={{
              paddingTop: scrollSpacing.paddingTop,
              paddingBottom: scrollSpacing.paddingBottom,
            }}
            className="mx-auto max-w-[920px] space-y-2"
          >
            {loadState === "loadingMore" && (
              <div className="text-center text-[var(--label-tertiary)] text-[11px] py-2 select-none">
                Loading earlier messages...
              </div>
            )}
            {isRefreshing ? (
              <RefreshingConversationSkeleton />
            ) : loadState === "error" ? (
              <div className="mx-auto mt-8 max-w-[520px] rounded-[12px] border border-[var(--separator)] bg-[var(--fill-card)] px-4 py-3 text-center">
                <div className="text-[13px] text-[var(--label-primary)] select-none">
                  Failed to load conversation
                </div>
                {errorMessage && (
                  <div className="mt-1 text-[12px] text-[var(--label-secondary)] break-words select-text">
                    {errorMessage}
                  </div>
                )}
              </div>
            ) : entries.length === 0 && !hasMore ? (
              <div className="text-center text-[var(--label-tertiary)] text-[12px] pt-8 select-none">
                No messages yet
              </div>
            ) : (
              entries.map((entry, i) => {
                const key = getSessionEntryRenderKey(entry);
                return (
                  <div key={key} data-entry-key={key}>
                    <EntryItem
                      entry={entry}
                      entries={entries}
                      isLast={i === entries.length - 1}
                      isStreaming={isStreaming}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
        {/* 快速滚动到底部按钮 */}
        {showScrollBtn && (
          <div
            style={{ bottom: scrollSpacing.scrollButtonBottom }}
            className="absolute left-1/2 z-30 -translate-x-1/2"
          >
            <button
              onClick={scrollToBottom}
              className="select-none w-9 h-9 rounded-full bg-[var(--btn-solid)] border border-[var(--separator)] text-[var(--label-secondary)] flex items-center justify-center hover:bg-[var(--btn-solid-hover)] active:scale-95 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
              title="Scroll to bottom"
            >
              <ChevronsDown size={16} />
            </button>
          </div>
        )}

        {/* 底部悬浮输入区 */}
        <div
          ref={bottomChromeRef}
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 px-3 pb-0 md:px-4"
        >
          <div className="pointer-events-auto mx-auto w-full max-w-[920px]">
            <div className="glass-panel glass-panel-input px-3 py-2 md:px-4">
              {/* 状态 + 上下文 + 模型信息 */}
              {(instanceStatus || contextUsage || instanceModel) && (
                <div className="mb-1.5 flex items-center justify-between gap-3 px-1 text-[12px] text-[var(--label-secondary)]">
                  <span className="flex min-w-0 items-center gap-2">
                    <ComposerStatusIndicator status={instanceStatus} />
                    {contextUsage ? (
                      <span className="min-w-0 truncate">
                        <ContextIndicator contextUsage={contextUsage} />
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    {instanceModel && (
                      <ModelSelector
                        currentModel={instanceModel}
                        availableModels={availableModels}
                        onSelect={onSetModel}
                      />
                    )}
                    {thinkingLevel && (
                      <ThinkingSelector
                        currentLevel={thinkingLevel}
                        onSelect={onSetThinkingLevel}
                      />
                    )}
                  </span>
                </div>
              )}

              <div className="relative flex items-end overflow-hidden rounded-[14px] border border-[var(--separator)] bg-transparent">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  placeholder="Send a message..."
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  className="flex-1 resize-none bg-transparent text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] text-[16px] leading-[24px] px-3 py-[9px] outline-none overflow-hidden md:px-4 md:py-[10px] md:text-[14px] md:leading-[22px]"
                />
                <div className="flex-shrink-0 pb-[5px] pr-[5px] pointer-events-auto md:pb-[6px] md:pr-[6px]">
                  {composerButtonMode === "stop" ? (
                    <button
                      onClick={onAbort}
                      className="select-none w-[28px] h-[28px] rounded-full bg-red-500 text-white flex items-center justify-center hover:opacity-90 active:opacity-80 transition-opacity"
                      title="Stop"
                    >
                      <Square size={12} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={isBusy(instanceStatus) || !inputValue.trim()}
                      className={`select-none w-[28px] h-[28px] rounded-full flex items-center justify-center transition-opacity ${
                        !isBusy(instanceStatus) && inputValue.trim()
                          ? "bg-[var(--color-accent)] text-white hover:opacity-90 active:opacity-80"
                          : "bg-[var(--fill-secondary)] text-[var(--label-tertiary)] opacity-50 cursor-default"
                      }`}
                      title="Send"
                    >
                      <ArrowUp size={16} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div
              ref={bottomSafeGapRef}
              className="h-[var(--bottom-safe-gap)] md:h-0"
              aria-hidden="true"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function RefreshingConversationSkeleton() {
  return (
    <div
      className="space-y-3 pt-3 select-none"
      aria-label="Loading conversation"
    >
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="space-y-1.5 animate-pulse">
          <div className="h-3 w-20 rounded-full bg-[var(--fill-tertiary)]" />
          <div className="max-w-[680px] space-y-1.5 rounded-[10px] border border-[var(--separator)] bg-[var(--fill-card)] p-3">
            <div className="h-3 w-[82%] rounded-full bg-[var(--fill-secondary)]" />
            <div className="h-3 w-[64%] rounded-full bg-[var(--fill-tertiary)]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ComposerStatusIndicator({
  status,
}: {
  status?: InstanceStatus;
}) {
  if (!status) return null;

  const isRunning = status === "streaming";
  const isCompacting = status === "compacting";

  const colorClass = isRunning
    ? "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]"
    : isCompacting
      ? "bg-amber-500/10 text-amber-500"
      : "bg-green-500/10 text-green-500";

  const dotClass = isRunning
    ? "bg-[var(--color-accent)] animate-pulse"
    : isCompacting
      ? "bg-amber-500 animate-pulse"
      : "bg-green-500";

  const label = isRunning ? "执行中" : isCompacting ? "压缩中" : "在线";

  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 ${colorClass}`}
      title={label}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </span>
  );
}

/** 上下文用量指示器 */
function ContextIndicator({
  contextUsage,
}: {
  contextUsage?: ContextUsageInfo;
}) {
  if (!contextUsage) return null;

  const { tokens, contextWindow, percent } = contextUsage;
  if (tokens == null || percent == null) return null;

  const color = percent > 90 ? "#ff4245" : percent > 60 ? "#ff9230" : "#30d158";

  // 格式化 token 数（对齐 footer 插件逻辑）
  const fmt = (n: number) => {
    if (n < 1000) return String(n);
    if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
    if (n < 1000000) return `${Math.round(n / 1000)}k`;
    const m = n / 1000000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  };

  return (
    <span className="select-text" style={{ color }}>
      {fmt(tokens)} / {fmt(contextWindow)} ({Math.round(percent)}%)
    </span>
  );
}
