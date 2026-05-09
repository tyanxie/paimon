// Raw 模式渲染：原始数据展示，适合调试

import type { SessionEntry } from "../../stores/useAppState";

export function RawEntryItem({
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
        <MessageContent content={message.content} />
      </div>
    </div>
  );
}

/** 消息内容渲染 */
function MessageContent({ content }: { content: unknown }) {
  // user message: content 可能是 string
  if (typeof content === "string") {
    return <>{content}</>;
  }

  // content blocks 数组
  if (Array.isArray(content)) {
    return (
      <>
        {content.map((block: any, i: number) => (
          <ContentBlock key={i} block={block} />
        ))}
      </>
    );
  }

  // fallback
  return <>{JSON.stringify(content)}</>;
}

/** 单个 content block 渲染 */
function ContentBlock({ block }: { block: any }) {
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
