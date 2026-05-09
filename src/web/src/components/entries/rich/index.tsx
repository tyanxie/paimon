// Rich 模式渲染：气泡对话 + Markdown + Tool Cards
// macOS 26 Liquid Glass 设计风格

import type { SessionEntry } from "../../../stores/useAppState";
import { MarkdownRenderer } from "./Markdown";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";

export function RichEntryItem({
  entry,
  index,
  entries,
  isLast,
  isStreaming,
}: {
  entry: SessionEntry;
  index: number;
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
  return (
    <div className="flex justify-center px-4 py-2">
      <div className="px-3 py-1 rounded-full bg-[var(--fill-tertiary)] text-[11px] text-[var(--label-tertiary)]">
        {type === "compaction" ? "对话已压缩" : "分支摘要"}
        {summary && (
          <span className="ml-1.5 opacity-70">— {summary.slice(0, 60)}</span>
        )}
      </div>
    </div>
  );
}
