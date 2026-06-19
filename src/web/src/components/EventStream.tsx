// 事件流画布：展示选中实例的对话 entries

import { useRef, useLayoutEffect, useState, useCallback } from "react";
import {
  ArrowUp,
  Square,
  ChevronsDown,
  Minimize2,
  ImagePlus,
  X,
} from "lucide-react";
import type {
  InstanceId,
  ContextUsageInfo,
  ImagePayload,
  ModelInfo,
  ThinkingLevel,
  SessionListItem,
  InstanceStatus,
} from "../../../protocol/types";
import {
  getSessionEntryRenderKey,
  type ConversationLoadState,
  type SessionEntry,
  type InputDraft,
  type InputDraftUpdater,
} from "../stores/useAppState";
import { useLogoSrc } from "../hooks/useLogoSrc";
import { isStreaming as isStatusStreaming, isBusy } from "../utils/status";
import { processImageFile, getImagesFromClipboard } from "../utils/image";
import { EntryItem } from "./entries";
import { ImageLightbox } from "./ui/ImageLightbox";
import { showToast } from "./ui/Toast";
import { MobileNavBar } from "./ui/MobileNavBar";
import { InstanceHeader } from "./ui/InstanceHeader";
import { ModelSelector } from "./ui/ModelSelector";
import { ThinkingSelector } from "./ui/ThinkingSelector";
import { SessionPopover } from "./ui/SessionPopover";
import { CompactModal } from "./ui/CompactModal";
import { useTranslation } from "react-i18next";

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

export function getComposerButtonMode(instanceStatus?: InstanceStatus) {
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
  draft: InputDraft;
  onDraftChange: (value: InputDraftUpdater) => void;
  onSendMessage: (message: string, images?: ImagePayload[]) => void;
  onAbort: () => void;
  onSetModel?: (provider: string, id: string) => void;
  onSetThinkingLevel?: (level: ThinkingLevel) => void;
  instanceStatus?: InstanceStatus;
  hasMore?: boolean;
  onLoadMore?: () => void;
  contextUsage?: ContextUsageInfo;
  gitBranch?: string | null;
  instanceCwd?: string;
  instanceHomedir?: string;
  instanceName?: string;
  instanceModel?: ModelInfo;
  availableModels?: ModelInfo[];
  thinkingLevel?: ThinkingLevel;
  sessionList?: SessionListItem[];
  sessionListLoading?: boolean;
  onListSessions?: () => void;
  onNewSession?: () => void;
  onSwitchSession?: (path: string) => void;
  onCompact?: (customInstructions?: string) => void;
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
  draft,
  onDraftChange,
  onSendMessage,
  onAbort,
  onSetModel,
  onSetThinkingLevel,
  instanceStatus,
  hasMore = false,
  onLoadMore,
  contextUsage,
  gitBranch,
  instanceCwd,
  instanceHomedir,
  instanceName,
  instanceModel,
  availableModels,
  thinkingLevel,
  sessionList = [],
  sessionListLoading = false,
  onListSessions,
  onNewSession,
  onSwitchSession,
  onCompact,
}: EventStreamProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const topChromeRef = useRef<HTMLDivElement>(null);
  const bottomChromeRef = useRef<HTMLDivElement>(null);
  const bottomSafeGapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoSrc = useLogoSrc();
  const [showCompactModal, setShowCompactModal] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const isRefreshing = loadState === "refreshing";
  const composerButtonMode = getComposerButtonMode(instanceStatus);
  // 上下文信息 + 压缩按钮作为整体：tokens 有值时同时展示，最后一条是 compaction entry 时不显示压缩按钮（无内容可压缩）
  const lastEntryIsCompaction =
    entries.length > 0 && entries[entries.length - 1].type === "compaction";
  const showContextInfo =
    !!contextUsage &&
    contextUsage.tokens != null &&
    contextUsage.percent != null;
  const compactDisabled = isBusy(instanceStatus);
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
  }, [draft.text, resizeTextarea]);

  // textarea 自动调整高度
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onDraftChange((prev) => ({ ...prev, text: e.target.value }));
      resizeTextarea(e.target);
    },
    [onDraftChange, resizeTextarea],
  );

  // 发送条件
  const canSend =
    !isBusy(instanceStatus) && (!!draft.text.trim() || draft.images.length > 0);

  // 发送消息
  const handleSend = useCallback(() => {
    const current = draftRef.current;
    if (
      isBusy(instanceStatus) ||
      (!current.text.trim() && current.images.length === 0)
    )
      return;
    const images: ImagePayload[] | undefined = current.images.length
      ? current.images.map((img) => ({
          data: img.data,
          mimeType: img.mimeType,
        }))
      : undefined;
    onSendMessage(current.text.trim(), images);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    startBottomFollow();
  }, [instanceStatus, onSendMessage, startBottomFollow]);

  // 键盘事件：Enter 发送，Shift+Enter 换行，IME 组合输入中不触发
  // keyCode 229 用于拦截 Safari 上 IME 确认拼音时的回车（此时 isComposing 已为 false）
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // 粘贴图片处理
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = getImagesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      Promise.all(files.map(processImageFile))
        .then((processed) => {
          onDraftChange((prev) => ({
            ...prev,
            images: [...prev.images, ...processed],
          }));
        })
        .catch((err) => {
          showToast(t("eventStream.imageProcessFailed"));
          console.error("Image process failed:", err);
        });
    },
    [onDraftChange, t],
  );

  // 文件上传处理
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      Promise.all(files.map(processImageFile))
        .then((processed) => {
          onDraftChange((prev) => ({
            ...prev,
            images: [...prev.images, ...processed],
          }));
        })
        .catch((err) => {
          showToast(t("eventStream.imageProcessFailed"));
          console.error("Image process failed:", err);
        });
      // 重置 input 以便再次选择相同文件
      e.target.value = "";
    },
    [onDraftChange, t],
  );

  // 移除已附加的图片
  const handleRemoveImage = useCallback(
    (id: string) => {
      onDraftChange((prev) => ({
        ...prev,
        images: prev.images.filter((img) => img.id !== id),
      }));
    },
    [onDraftChange],
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
            {t("eventStream.tagline")}
          </div>
        </div>
      </div>
    );
  }

  const title = instanceName || "";

  // 实例顶栏 props（PC 和移动端共用）
  const instanceHeaderProps = {
    title,
    cwd: instanceCwd,
    homedir: instanceHomedir,
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
              title={t("eventStream.scrollToBottom")}
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
              {/* 信息行：状态 + 上下文 + 压缩按钮 */}
              {(instanceStatus || showContextInfo) && (
                <div className="mb-1.5 flex items-center gap-2 px-1 text-[12px] leading-[15px] text-[var(--label-secondary)]">
                  <ComposerStatusIndicator status={instanceStatus} />
                  {showContextInfo && (
                    <span className="min-w-0 flex items-center gap-1">
                      <span className="min-w-0 truncate">
                        <ContextIndicator contextUsage={contextUsage} />
                      </span>
                      {/* 压缩按钮：最后一条是 compaction entry 时不显示（无内容可压缩） */}
                      {!lastEntryIsCompaction && onCompact && (
                        <button
                          onClick={() => setShowCompactModal(true)}
                          disabled={compactDisabled}
                          title={t("eventStream.compactContext")}
                          className="shrink-0 inline-flex items-center justify-center p-0.5 rounded-[4px] text-[var(--label-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--fill-tertiary)] transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <Minimize2 size={12} />
                        </button>
                      )}
                    </span>
                  )}
                </div>
              )}

              {/* 输入框区域：textarea + 图片预览 + 操作行在同一个 border 内 */}
              <div className="flex flex-col overflow-hidden rounded-[14px] border border-[var(--separator)]">
                {/* 图片预览条 */}
                {draft.images.length > 0 && (
                  <div className="flex gap-2 px-3 pt-2 pb-0 overflow-x-auto scrollbar-none md:px-4">
                    {draft.images.map((img) => (
                      <div
                        key={img.id}
                        className="relative flex-shrink-0 group"
                      >
                        <button
                          onClick={() => setLightboxSrc(img.previewUrl)}
                          className="block rounded-[8px] overflow-hidden border border-[var(--separator)] hover:border-[var(--color-accent)] transition-colors"
                        >
                          <img
                            src={img.previewUrl}
                            alt="Attached"
                            className="w-[60px] h-[60px] object-cover"
                            draggable={false}
                          />
                        </button>
                        <button
                          onClick={() => handleRemoveImage(img.id)}
                          className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-[var(--fill-secondary)] border border-[var(--separator)] text-[var(--label-secondary)] flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[var(--fill-tertiary)] transition-opacity"
                          aria-label="Remove image"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  rows={1}
                  placeholder={t("eventStream.sendPlaceholder")}
                  value={draft.text}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  className="resize-none bg-transparent text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] text-[16px] leading-[24px] px-3 pt-[9px] pb-0 outline-none overflow-hidden md:px-4 md:pt-[10px] md:text-[14px] md:leading-[22px]"
                />
                {/* 操作行：模型/thinking/上传 + 发送/停止 */}
                <div className="flex items-center justify-between px-1.5 pt-[9px] pb-1.5 md:pt-[10px]">
                  <div className="flex items-center gap-1">
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
                    {/* 上传图片按钮 */}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="select-none h-[26px] px-1.5 rounded-[6px] flex items-center justify-center text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] transition-colors"
                      title={t("eventStream.attachImage")}
                    >
                      <ImagePlus size={15} />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      multiple
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                  <div className="flex-shrink-0">
                    {composerButtonMode === "stop" ? (
                      <button
                        onClick={onAbort}
                        className="select-none w-[28px] h-[28px] rounded-full bg-red-500 text-white flex items-center justify-center hover:opacity-90 active:opacity-80 transition-opacity"
                        title={t("eventStream.stop")}
                      >
                        <Square size={12} fill="currentColor" />
                      </button>
                    ) : (
                      <button
                        onClick={handleSend}
                        disabled={!canSend}
                        className={`select-none w-[28px] h-[28px] rounded-full flex items-center justify-center transition-opacity ${
                          canSend
                            ? "bg-[var(--color-accent)] text-white hover:opacity-90 active:opacity-80"
                            : "bg-[var(--fill-secondary)] text-[var(--label-tertiary)] opacity-50 cursor-default"
                        }`}
                        title={t("eventStream.send")}
                      >
                        <ArrowUp size={16} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
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
      {/* 压缩上下文 Modal */}
      {showCompactModal && onCompact && (
        <CompactModal
          onClose={() => setShowCompactModal(false)}
          onConfirm={(customInstructions) => {
            onCompact(customInstructions);
            setShowCompactModal(false);
          }}
        />
      )}
      {/* 图片大图查看 */}
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
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
  const { t } = useTranslation();
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

  const label = isRunning
    ? t("eventStream.statusRunning")
    : isCompacting
      ? t("eventStream.statusCompacting")
      : t("eventStream.statusOnline");

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
  contextUsage: ContextUsageInfo;
}) {
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
