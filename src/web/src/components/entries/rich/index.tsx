// Rich 模式渲染：气泡对话 + Markdown + Tool Cards
// macOS 26 Liquid Glass 设计风格

import { useState } from "react";
import type { SessionEntry } from "../../../stores/useAppState";
import { MarkdownRenderer } from "./Markdown";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";
import { X } from "lucide-react";

export function RichEntryItem({
  entry,
  entries,
  isLast,
  isStreaming,
}: {
  entry: SessionEntry;
  entries: SessionEntry[];
  isLast: boolean;
  isStreaming: boolean;
}) {
  const streaming = isLast && isStreaming;

  switch (entry.type) {
    case "message":
      return (
        <RichMessageItem
          entry={entry}
          entries={entries}
          streaming={streaming}
        />
      );
    case "compaction":
    case "branch_summary":
      return <MetaEntry type={entry.type} summary={entry.summary ?? ""} />;
    default:
      return null;
  }
}

/** 消息条目：根据 role 分发不同布局 */
function RichMessageItem({
  entry,
  entries,
  streaming,
}: {
  entry: SessionEntry;
  entries: SessionEntry[];
  streaming: boolean;
}) {
  const message = entry.message;
  if (!message) return null;

  switch (message.role) {
    case "user":
      return <UserBubble content={message.content} />;
    case "assistant":
      return (
        <AssistantMessage
          content={message.content}
          entries={entries}
          streaming={streaming}
        />
      );
    case "toolResult":
      // toolResult 在 Rich 模式下由 ToolCallCard 消费，直接跳过
      return null;
    default:
      return null;
  }
}

/** 用户消息：右对齐气泡 */
function UserBubble({ content }: { content: unknown }) {
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("")
        : JSON.stringify(content);

  return (
    <div className="flex justify-end px-4 py-1.5">
      <div className="max-w-[80%] px-3.5 py-2 rounded-[16px] rounded-br-[4px] bg-[var(--color-accent)] text-white">
        <p className="text-[13px] leading-[18px] whitespace-pre-wrap break-words">
          {text}
        </p>
      </div>
    </div>
  );
}

/** 助手消息：左对齐全宽，解析 content blocks */
function AssistantMessage({
  content,
  entries,
  streaming,
}: {
  content: unknown;
  entries: SessionEntry[];
  streaming: boolean;
}) {
  if (!Array.isArray(content)) {
    return (
      <div className="px-4 py-1.5">
        <MarkdownRenderer content={String(content)} />
      </div>
    );
  }

  // 判断是否还在产出 thinking（用于自动折叠逻辑）
  const lastBlock = content[content.length - 1];
  const isThinking = streaming && lastBlock?.type === "thinking";
  // 如果有 text/toolCall block 出现了，说明正式输出已开始
  const hasOutput = content.some(
    (b: any) => b.type === "text" || b.type === "toolCall",
  );

  return (
    <div className="px-4 py-1.5 space-y-2">
      {content.map((block: any, i: number) => (
        <AssistantBlock
          key={i}
          block={block}
          entries={entries}
          streaming={streaming && i === content.length - 1}
          autoCollapse={block.type === "thinking" && hasOutput && !isThinking}
        />
      ))}
      {streaming && lastBlock?.type !== "thinking" && (
        <span className="inline-block w-2 h-4 bg-[var(--label-tertiary)] rounded-sm animate-pulse" />
      )}
    </div>
  );
}

/** 助手消息内的单个 block */
function AssistantBlock({
  block,
  entries,
  streaming,
  autoCollapse,
}: {
  block: any;
  entries: SessionEntry[];
  streaming: boolean;
  autoCollapse: boolean;
}) {
  switch (block.type) {
    case "text":
      return <MarkdownRenderer content={block.text} />;
    case "thinking":
      return (
        <ThinkingBlock
          content={block.thinking}
          streaming={streaming}
          autoCollapse={autoCollapse}
        />
      );
    case "toolCall":
      return (
        <ToolCallCard
          name={block.name}
          args={block.arguments}
          toolCallId={block.id}
          entries={entries}
        />
      );
    default:
      return null;
  }
}

/** 元信息条目（compaction / branch_summary） */
function MetaEntry({ type, summary }: { type: string; summary: string }) {
  const [showDetail, setShowDetail] = useState(false);
  const label = type === "compaction" ? "上下文已压缩" : "分支摘要";

  return (
    <>
      <div className="flex justify-center px-4 py-2">
        <button
          onClick={() => summary && setShowDetail(true)}
          className={`px-3 py-1 rounded-full bg-[var(--fill-tertiary)] text-[11px] text-[var(--label-tertiary)] transition-colors ${
            summary ? "hover:bg-[var(--fill-secondary)] cursor-pointer" : ""
          }`}
        >
          {label}
          {summary && (
            <span className="ml-1.5 opacity-70">
              — {summary.slice(0, 60)}
              {summary.length > 60 ? "..." : ""}
            </span>
          )}
        </button>
      </div>

      {showDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowDetail(false)}
        >
          <div
            className="w-[90%] max-w-[640px] max-h-[80vh] rounded-[18px] bg-[var(--panel-bg)] backdrop-blur-[30px] border border-[var(--separator)] shadow-[0_8px_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--separator)]">
              <span className="text-[15px] font-semibold text-[var(--label-primary)]">
                {label}
              </span>
              <button
                onClick={() => setShowDetail(false)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--fill-secondary)] transition-colors text-[var(--label-secondary)]"
              >
                <X size={14} />
              </button>
            </div>
            {/* 内容 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-auto">
              <MarkdownRenderer content={summary} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
