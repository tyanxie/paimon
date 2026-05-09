// 事件流面板：展示选中实例的对话 entries（独立玻璃面板）

import { useRef, useEffect, useState, useCallback } from "react";
import { ArrowUp, Square, ChevronsDown } from "lucide-react";
import type { InstanceId } from "../../../protocol/types";
import type { SessionEntry } from "../stores/useAppState";
import { useMessageRenderMode } from "../stores/useSettings";
import { RawEntryItem } from "./entries/raw";
import { RichEntryItem } from "./entries/rich";

interface EventStreamProps {
  entries: SessionEntry[];
  instanceId: InstanceId | null;
  isStreaming: boolean;
  onSendMessage: (message: string) => void;
  onAbort: () => void;
  instanceStatus?: "idle" | "streaming";
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function EventStream({
  entries,
  instanceId,
  isStreaming,
  onSendMessage,
  onAbort,
  instanceStatus,
  hasMore = false,
  onLoadMore,
}: EventStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [messageRenderMode] = useMessageRenderMode();
  const [inputValue, setInputValue] = useState("");

  // 自动滚到底部（仅当用户在底部附近时）
  const isAtBottomRef = useRef(true);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  // 标记正在调整 scroll 位置（prepend 场景），期间不更新 isAtBottom
  const adjustingScrollRef = useRef(false);

  useEffect(() => {
    if (scrollRef.current && isAtBottomRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  // 加载更多：滚动到顶部触发
  const loadingMoreRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const prevEntriesLengthRef = useRef(entries.length);

  // entries 变化后：调整滚动位置 + 重置 loading 状态
  useEffect(() => {
    if (
      loadingMoreRef.current &&
      entries.length > prevEntriesLengthRef.current
    ) {
      const el = scrollRef.current;
      if (el) {
        adjustingScrollRef.current = true;
        const newHeight = el.scrollHeight;
        el.scrollTop += newHeight - prevScrollHeightRef.current;
        // 下一帧恢复 scroll 监听
        requestAnimationFrame(() => {
          adjustingScrollRef.current = false;
        });
      }
      loadingMoreRef.current = false;
    }
    prevEntriesLengthRef.current = entries.length;
  }, [entries]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // 调整 scroll 位置期间不更新 isAtBottom 状态
    if (adjustingScrollRef.current) return;

    // 检测是否在底部（60px 容差）
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    isAtBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom);

    // 滚动到顶部加载更多
    if (
      el.scrollTop < 100 &&
      hasMore &&
      onLoadMore &&
      !loadingMoreRef.current
    ) {
      loadingMoreRef.current = true;
      prevScrollHeightRef.current = el.scrollHeight;
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

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
          <div className="text-[26px] font-light text-[var(--label-tertiary)] mb-2">
            Paimon
          </div>
          <div className="text-[13px] text-[var(--label-tertiary)]">
            Select a pi instance to observe
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 gap-3">
      {/* 对话流 */}
      <main className="glass-panel flex-1 flex flex-col min-h-0 overflow-hidden py-4 relative">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-5 space-y-1 scrollbar-auto"
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
              const EntryComponent =
                messageRenderMode === "rich" ? RichEntryItem : RawEntryItem;
              return (
                <EntryComponent
                  key={entry.id ?? `e-${i}`}
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
              className="w-9 h-9 rounded-full backdrop-blur-[30px] bg-[var(--fill-primary)] border border-[var(--separator)] text-[var(--label-secondary)] flex items-center justify-center hover:bg-[var(--fill-secondary)] active:scale-95 transition-all shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
              title="Scroll to bottom"
            >
              <ChevronsDown size={16} />
            </button>
          </div>
        )}
      </main>

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
        <div className="flex-shrink-0 pb-[6px] pr-[6px]">
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
