// 事件流面板：展示选中实例的对话 entries（独立玻璃面板）

import { useRef, useEffect, useState, useCallback } from "react";
import { ArrowUp, Square } from "lucide-react";
import type { InstanceId } from "../../../protocol/types";
import type { SessionEntry } from "../stores/useAppState";

interface EventStreamProps {
  entries: SessionEntry[];
  instanceId: InstanceId | null;
  isStreaming: boolean;
  onSendMessage: (message: string) => void;
  onAbort: () => void;
  instanceStatus?: "idle" | "streaming";
}

export function EventStream({
  entries,
  instanceId,
  isStreaming,
  onSendMessage,
  onAbort,
  instanceStatus,
}: EventStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState("");

  // 自动滚到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

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
      <main className="glass-panel flex-1 flex flex-col min-h-0 overflow-hidden py-4">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 space-y-1 scrollbar-auto"
        >
          {entries.length === 0 ? (
            <div className="text-center text-[var(--label-tertiary)] text-[12px] pt-8">
              Waiting for messages...
            </div>
          ) : (
            entries.map((entry, i) => (
              <EntryItem
                key={entry.id ?? `e-${i}`}
                entry={entry}
                isLast={i === entries.length - 1}
                isStreaming={isStreaming}
              />
            ))
          )}
        </div>
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

/** 统一的 entry 渲染组件 */
function EntryItem({
  entry,
  isLast,
  isStreaming,
}: {
  entry: SessionEntry;
  isLast: boolean;
  isStreaming: boolean;
}) {
  switch (entry.type) {
    case "message":
      return <MessageItem entry={entry} streaming={isLast && isStreaming} />;
    case "compaction":
      return (
        <MetaItem
          label="compaction"
          content={entry.summary ?? ""}
          color="text-pink-400"
        />
      );
    case "branch_summary":
      return (
        <MetaItem
          label="branch_summary"
          content={entry.summary ?? ""}
          color="text-pink-400"
        />
      );
    default:
      return (
        <MetaItem
          label={entry.type}
          content={entry.summary ?? JSON.stringify(entry).slice(0, 200)}
          color="text-[var(--label-tertiary)]"
        />
      );
  }
}

/** 消息条目渲染 */
function MessageItem({
  entry,
  streaming,
}: {
  entry: SessionEntry;
  streaming: boolean;
}) {
  const message = entry.message;
  if (!message) return null;

  const role = message.role;
  const timestamp = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString()
    : "";

  const getRoleColor = (r: string) => {
    if (r === "user") return "text-green-400";
    if (r === "assistant") return "text-[var(--color-accent)]";
    if (r === "toolResult") return "text-purple-400";
    return "text-[var(--label-secondary)]";
  };

  return (
    <div className="group px-3 py-1.5 rounded-[8px] hover:bg-[var(--fill-tertiary)] transition-colors">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] text-[var(--label-tertiary)] tabular-nums">
          {timestamp}
        </span>
        <span className={`text-[11px] font-medium ${getRoleColor(role)}`}>
          {role}
          {streaming && <span className="ml-1 animate-pulse">...</span>}
        </span>
      </div>
      <div className="text-[12px] text-[var(--label-secondary)] mt-0.5 break-words whitespace-pre-wrap">
        <MessageContent content={message.content} role={role} />
      </div>
    </div>
  );
}

/** 消息内容渲染 */
function MessageContent({ content, role }: { content: unknown; role: string }) {
  // user message: content 可能是 string
  if (typeof content === "string") {
    return <>{content}</>;
  }

  // content blocks 数组
  if (Array.isArray(content)) {
    return (
      <>
        {content.map((block: any, i: number) => (
          <ContentBlock key={i} block={block} role={role} />
        ))}
      </>
    );
  }

  // fallback
  return <>{JSON.stringify(content)}</>;
}

/** 单个 content block 渲染 */
function ContentBlock({ block, role }: { block: any; role: string }) {
  if (!block || typeof block !== "object") {
    return <span>{JSON.stringify(block)}</span>;
  }

  switch (block.type) {
    case "text":
      return <span>{block.text}</span>;
    case "thinking":
      return (
        <details className="my-1">
          <summary className="text-[11px] text-yellow-400 cursor-pointer">
            thinking
          </summary>
          <div className="pl-3 mt-1 text-[11px] text-[var(--label-tertiary)] whitespace-pre-wrap">
            {block.thinking}
          </div>
        </details>
      );
    case "toolCall":
      return (
        <div className="my-1 pl-3 border-l-2 border-purple-400/50">
          <span className="text-[11px] text-purple-400 font-medium">
            {block.name}
          </span>
          <div className="text-[11px] text-[var(--label-tertiary)] mt-0.5 whitespace-pre-wrap">
            {typeof block.arguments === "string"
              ? block.arguments
              : JSON.stringify(block.arguments, null, 2)}
          </div>
        </div>
      );
    case "image":
      return (
        <div className="my-1 text-[11px] text-[var(--label-tertiary)]">
          [image: {block.mimeType}]
        </div>
      );
    default:
      return (
        <span className="text-[11px] text-[var(--label-tertiary)]">
          [{block.type}]
        </span>
      );
  }
}

/** 元信息条目（compaction / branch_summary / unknown） */
function MetaItem({
  label,
  content,
  color,
}: {
  label: string;
  content: string;
  color: string;
}) {
  return (
    <div className="px-3 py-1 rounded-[8px] hover:bg-[var(--fill-tertiary)] transition-colors">
      <span className={`text-[11px] font-medium ${color}`}>[{label}]</span>
      {content && (
        <span className="text-[11px] text-[var(--label-tertiary)] ml-2">
          {content}
        </span>
      )}
    </div>
  );
}
