// 事件流面板：展示选中实例的对话 entries（独立玻璃面板）

import { useRef, useLayoutEffect, useState, useCallback } from "react";
import { ArrowUp, Square, ChevronsDown, GitBranch } from "lucide-react";
import type {
  InstanceId,
  ContextUsageInfo,
  ModelInfo,
} from "../../../protocol/types";
import {
  getSessionEntryRenderKey,
  type SessionEntry,
} from "../stores/useAppState";
import { EntryItem } from "./entries";
import { MobileNavBar } from "./ui/MobileNavBar";
import { ModelSelector } from "./ui/ModelSelector";

const DEBUG_SCROLL = true;
const LOAD_MORE_SUPPRESS_MS = 350;

function logScroll(label: string, data: Record<string, unknown>) {
  if (!DEBUG_SCROLL) return;
  console.log(`[PaimonScroll] ${label}`, data);
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

export function getSafeScrollTop(rawScrollTop: number) {
  return Math.max(0, rawScrollTop);
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

interface EventStreamProps {
  entries: SessionEntry[];
  instanceId: InstanceId | null;
  isStreaming: boolean;
  onSendMessage: (message: string) => void;
  onAbort: () => void;
  onSetModel?: (provider: string, id: string) => void;
  instanceStatus?: "idle" | "streaming";
  hasMore?: boolean;
  onLoadMore?: () => void;
  contextUsage?: ContextUsageInfo;
  gitBranch?: string | null;
  instanceName?: string;
  instanceModel?: ModelInfo;
  availableModels?: ModelInfo[];
}

export function EventStream({
  entries,
  instanceId,
  isStreaming,
  onSendMessage,
  onAbort,
  onSetModel,
  instanceStatus,
  hasMore = false,
  onLoadMore,
  contextUsage,
  gitBranch,
  instanceName,
  instanceModel,
  availableModels,
}: EventStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [inputValue, setInputValue] = useState("");

  // 自动滚到底部（仅当用户在底部附近时）
  const isAtBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // 标记正在调整 scroll 位置（prepend 场景），期间不更新 isAtBottom
  const adjustingScrollRef = useRef(false);

  // 加载更多：滚动到顶部触发
  const loadingMoreRef = useRef(false);
  const prevScrollTopRef = useRef(0);
  const prevScrollHeightRef = useRef(0);
  const prevEntriesLengthRef = useRef(entries.length);
  const firstEntryKeyBeforeLoadRef = useRef<string | undefined>(undefined);
  const suppressLoadMoreUntilRef = useRef(0);

  // 此 effect 需要先于 prepend restore 执行，依赖 loadingMoreRef 在本轮渲染中尚未被清除。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (loadingMoreRef.current) {
      logScroll("auto-bottom skipped", {
        instanceId,
        entriesLength: entries.length,
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        loadingMore: loadingMoreRef.current,
        isAtBottom: isAtBottomRef.current,
      });
      return;
    }

    if (isAtBottomRef.current) {
      logScroll("auto-bottom apply", {
        instanceId,
        entriesLength: entries.length,
        beforeTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      });
      el.scrollTop = el.scrollHeight;
      logScroll("auto-bottom after", {
        instanceId,
        afterTop: el.scrollTop,
        maxTop: el.scrollHeight - el.clientHeight,
      });
    }
  }, [entries, instanceId]);

  // entries 变化后：调整滚动位置 + 重置 loading 状态
  useLayoutEffect(() => {
    const el = scrollRef.current;

    logScroll("entries layout effect", {
      instanceId,
      entriesLength: entries.length,
      prevEntriesLength: prevEntriesLengthRef.current,
      hasMore,
      loadingMore: loadingMoreRef.current,
      scrollTop: el?.scrollTop,
      scrollHeight: el?.scrollHeight,
      clientHeight: el?.clientHeight,
      maxTop: el ? el.scrollHeight - el.clientHeight : undefined,
      prevTop: prevScrollTopRef.current,
      prevHeight: prevScrollHeightRef.current,
      firstKeyBeforeLoad: firstEntryKeyBeforeLoadRef.current,
      currentFirstKey: entries[0]
        ? getSessionEntryRenderKey(entries[0])
        : undefined,
    });

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
        adjustingScrollRef.current = true;
        const targetTop = calculatePrependScrollTop({
          previousScrollTop: prevScrollTopRef.current,
          previousScrollHeight: prevScrollHeightRef.current,
          nextScrollHeight: el.scrollHeight,
        });
        logScroll("prepend restore apply", {
          instanceId,
          prevTop: prevScrollTopRef.current,
          prevHeight: prevScrollHeightRef.current,
          newHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          maxTop: el.scrollHeight - el.clientHeight,
          targetTop,
          beforeTop: el.scrollTop,
          didPrepend,
          entriesLength: entries.length,
          prevEntriesLength: prevEntriesLengthRef.current,
        });
        el.scrollTop = targetTop;
        suppressLoadMoreUntilRef.current =
          performance.now() + LOAD_MORE_SUPPRESS_MS;
        logScroll("prepend restore after", {
          instanceId,
          afterTop: el.scrollTop,
          maxTop: el.scrollHeight - el.clientHeight,
          suppressUntil: suppressLoadMoreUntilRef.current,
        });
        loadingMoreRef.current = false;
        firstEntryKeyBeforeLoadRef.current = undefined;
        // 下一帧恢复 scroll 监听
        requestAnimationFrame(() => {
          adjustingScrollRef.current = false;
        });
      } else {
        // 等待 history 响应期间如果只是底部新增消息，更新基准高度，避免后续 prepend 过度补偿
        prevScrollHeightRef.current = el.scrollHeight;
        logScroll("non-prepend growth while loading", {
          instanceId,
          entriesLength: entries.length,
          scrollHeight: el.scrollHeight,
          scrollTop: el.scrollTop,
        });
      }
    }

    if (loadingMoreRef.current && !hasMore) {
      logScroll("loading reset because hasMore false", {
        instanceId,
        entriesLength: entries.length,
        scrollTop: el?.scrollTop,
        scrollHeight: el?.scrollHeight,
      });
      loadingMoreRef.current = false;
      firstEntryKeyBeforeLoadRef.current = undefined;
    }

    prevEntriesLengthRef.current = entries.length;
  }, [entries, hasMore, instanceId]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // 调整 scroll 位置期间不更新 isAtBottom 状态
    if (adjustingScrollRef.current) return;

    const rawScrollTop = el.scrollTop;
    const safeScrollTop = getSafeScrollTop(rawScrollTop);
    const isSuppressed = performance.now() < suppressLoadMoreUntilRef.current;

    if (rawScrollTop < 0) {
      isAtBottomRef.current = false;
      setShowScrollBtn(true);
      logScroll("ignore safari overscroll", {
        instanceId,
        rawTop: rawScrollTop,
        isSuppressed,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      });
      return;
    }

    // 检测是否在底部（60px 容差）
    const atBottom = el.scrollHeight - safeScrollTop - el.clientHeight < 60;
    isAtBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom);

    const willLoadMore = shouldLoadMoreFromScroll({
      rawScrollTop,
      hasMore,
      canLoadMore: !!onLoadMore,
      isLoadingMore: loadingMoreRef.current,
      isSuppressed,
    });

    logScroll("scroll", {
      instanceId,
      scrollTop: rawScrollTop,
      safeScrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      maxTop: el.scrollHeight - el.clientHeight,
      atBottom,
      hasMore,
      loadingMore: loadingMoreRef.current,
      isSuppressed,
      willLoadMore,
      entriesLength: entriesRef.current.length,
    });

    // 滚动到顶部加载更多
    if (willLoadMore && onLoadMore) {
      loadingMoreRef.current = true;
      prevScrollTopRef.current = safeScrollTop;
      prevScrollHeightRef.current = el.scrollHeight;
      const currentEntries = entriesRef.current;
      firstEntryKeyBeforeLoadRef.current = currentEntries[0]
        ? getSessionEntryRenderKey(currentEntries[0])
        : undefined;
      logScroll("load-more trigger", {
        instanceId,
        prevTop: prevScrollTopRef.current,
        rawTop: rawScrollTop,
        prevHeight: prevScrollHeightRef.current,
        clientHeight: el.clientHeight,
        maxTop: el.scrollHeight - el.clientHeight,
        firstKeyBeforeLoad: firstEntryKeyBeforeLoadRef.current,
        entriesLength: currentEntries.length,
        atBottom,
      });
      onLoadMore();
    }
  }, [hasMore, instanceId, onLoadMore]);

  // 快速滚动到底部
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      isAtBottomRef.current = true;
      setShowScrollBtn(false);
    }
  }, []);

  // textarea 自动调整高度
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      const newHeight = Math.min(el.scrollHeight, 150);
      el.style.height = `${newHeight}px`;
      el.style.overflowY = el.scrollHeight > 150 ? "auto" : "hidden";
    },
    [],
  );

  // 发送消息
  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue.trim());
    setInputValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [inputValue, onSendMessage]);

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
      <div className="glass-panel flex-1 flex items-center justify-center">
        <div className="text-center">
          <img
            src="/paimon-logo.png"
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

  return (
    <div className="flex-1 flex flex-col min-w-0 gap-2 md:gap-3">
      {/* 对话流 */}
      <main className="glass-panel flex-1 flex flex-col min-h-0 overflow-hidden relative p-3 md:p-4">
        {/* 移动端导航栏 */}
        <MobileNavBar
          title={instanceName || "Instance"}
          subtitle={
            instanceModel
              ? instanceModel.name ||
                `${instanceModel.provider}/${instanceModel.id}`
              : undefined
          }
        />
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{ overflowAnchor: "none" }}
          className="flex-1 overflow-y-auto space-y-1 scrollbar-auto"
        >
          {hasMore && (
            <div className="text-center text-[var(--label-tertiary)] text-[11px] py-2">
              Loading earlier messages...
            </div>
          )}
          {entries.length === 0 && !hasMore ? (
            <div className="text-center text-[var(--label-tertiary)] text-[12px] pt-8">
              Waiting for messages...
            </div>
          ) : (
            entries.map((entry, i) => {
              return (
                <EntryItem
                  key={getSessionEntryRenderKey(entry)}
                  entry={entry}
                  entries={entries}
                  isLast={i === entries.length - 1}
                  isStreaming={isStreaming}
                />
              );
            })
          )}
        </div>
        {/* 快速滚动到底部按钮 */}
        {showScrollBtn && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <button
              onClick={scrollToBottom}
              className="w-9 h-9 rounded-full bg-[var(--btn-solid)] border border-[var(--separator)] text-[var(--label-secondary)] flex items-center justify-center hover:bg-[var(--btn-solid-hover)] active:scale-95 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
              title="Scroll to bottom"
            >
              <ChevronsDown size={16} />
            </button>
          </div>
        )}
      </main>

      {/* 上下文 + 模型 + 分支信息（输入框上方） */}
      {(contextUsage || instanceModel || gitBranch) && (
        <div className="flex items-center justify-between px-3 -mb-2 text-[12px] text-[var(--label-secondary)]">
          <span>
            {contextUsage ? (
              <ContextIndicator contextUsage={contextUsage} />
            ) : null}
          </span>
          <span className="flex items-center gap-2.5">
            {instanceModel && (
              <ModelSelector
                currentModel={instanceModel}
                availableModels={availableModels}
                onSelect={onSetModel}
              />
            )}
            {gitBranch && (
              <span className="flex items-center gap-1 opacity-70">
                <GitBranch size={10} />
                {gitBranch}
              </span>
            )}
          </span>
        </div>
      )}

      {/* 输入栏（独立玻璃胶囊） */}
      <div
        className={`relative flex items-end rounded-[20px] overflow-hidden glass-panel ${
          instanceStatus === "streaming"
            ? "glass-panel-disabled"
            : "glass-panel-input"
        }`}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder={
            instanceStatus === "streaming"
              ? "Agent is running..."
              : "Send a message..."
          }
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={instanceStatus === "streaming"}
          className="flex-1 resize-none bg-transparent text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] text-[13px] leading-[20px] px-4 py-[10px] outline-none overflow-hidden disabled:cursor-default"
        />
        <div className="flex-shrink-0 pb-[6px] pr-[6px] pointer-events-auto">
          {instanceStatus === "streaming" && !inputValue.trim() ? (
            <button
              onClick={onAbort}
              className="w-[28px] h-[28px] rounded-full bg-red-500 text-white flex items-center justify-center hover:opacity-90 active:opacity-80 transition-opacity"
              title="Stop"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className={`w-[28px] h-[28px] rounded-full flex items-center justify-center transition-opacity ${
                inputValue.trim()
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
    <span style={{ color }}>
      {fmt(tokens)} / {fmt(contextWindow)} ({Math.round(percent)}%)
    </span>
  );
}
