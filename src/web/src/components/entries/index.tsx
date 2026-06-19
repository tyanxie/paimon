// 会话条目渲染：气泡对话 + Markdown + Tool Cards
// macOS 26 Liquid Glass 设计风格

import { useState } from "react";
import { AlertCircle, ChevronRight } from "lucide-react";
import type { SessionEntry } from "../../stores/useAppState";
import { MarkdownRenderer } from "./Markdown";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";
import { ModalShell } from "../ui/ModalShell";
import { useTranslation } from "react-i18next";

export function EntryItem({
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
          stopReason={(message as any).stopReason}
          errorMessage={(message as any).errorMessage}
        />
      );
    case "toolResult":
      // toolResult 由 ToolCallCard 消费，直接跳过
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
        <p className="text-[14px] leading-[21px] whitespace-pre-wrap break-words">
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
  stopReason,
  errorMessage,
}: {
  content: unknown;
  entries: SessionEntry[];
  streaming: boolean;
  stopReason?: string;
  errorMessage?: string;
}) {
  // API 报错且无内容
  if (
    (stopReason === "error" || stopReason === "aborted") &&
    errorMessage &&
    (!Array.isArray(content) || content.length === 0)
  ) {
    return (
      <div className="px-4">
        <ErrorCard message={errorMessage} />
      </div>
    );
  }

  if (!Array.isArray(content)) {
    return (
      <div className="px-4">
        <MarkdownRenderer content={String(content)} />
      </div>
    );
  }

  // 消息是否已终止（手动 abort 或 API 报错）
  const isAborted = stopReason === "aborted" || stopReason === "error";

  // 判断是否还在产出 thinking（用于自动折叠逻辑）
  const lastBlock = content[content.length - 1];
  const isThinking = streaming && lastBlock?.type === "thinking";
  // 如果有 text/toolCall block 出现了，说明正式输出已开始
  const hasOutput =
    content.some((b: any) => b.type === "text" || b.type === "toolCall") ||
    isAborted;

  return (
    <div className="px-4 space-y-2">
      {content.map((block: any, i: number) => (
        <AssistantBlock
          key={i}
          block={block}
          entries={entries}
          streaming={streaming && i === content.length - 1}
          autoCollapse={block.type === "thinking" && hasOutput && !isThinking}
          isAborted={isAborted}
        />
      ))}
      {/* 部分输出 + 最终报错 */}
      {(stopReason === "error" || stopReason === "aborted") && errorMessage && (
        <ErrorCard message={errorMessage} />
      )}
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
  isAborted,
}: {
  block: any;
  entries: SessionEntry[];
  streaming: boolean;
  autoCollapse: boolean;
  isAborted: boolean;
}) {
  switch (block.type) {
    case "text":
      return <MarkdownRenderer content={block.text} />;
    case "thinking":
      // 思考内容为空时不渲染
      if (!block.thinking?.trim()) return null;
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
          isAborted={isAborted}
        />
      );
    default:
      return null;
  }
}

/** 元信息条目（compaction / branch_summary） */
function MetaEntry({ type, summary }: { type: string; summary: string }) {
  const { t } = useTranslation();
  const [showDetail, setShowDetail] = useState(false);
  const label =
    type === "compaction"
      ? t("entries.contextCompacted")
      : t("entries.branchSummary");

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
        <ModalShell title={label} onClose={() => setShowDetail(false)}>
          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-auto">
            <MarkdownRenderer content={summary} />
          </div>
        </ModalShell>
      )}
    </>
  );
}

/** API 错误卡片 */
function ErrorCard({ message }: { message: string }) {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);

  // 尝试提取简要信息
  let brief = message;
  let detail = "";
  let errorType = "";
  let requestId = "";
  const jsonStart = message.indexOf("{");
  if (jsonStart > 0) {
    brief = message.slice(0, jsonStart).trim();
    try {
      const parsed = JSON.parse(message.slice(jsonStart));
      detail = parsed?.error?.message ?? message.slice(jsonStart);
      errorType = parsed?.error?.type ?? "";
      // 尝试从 message 中提取 request id
      const reqIdMatch = detail.match(/request id:\s*([\w]+)/i);
      if (reqIdMatch) requestId = reqIdMatch[1];
    } catch {
      detail = message.slice(jsonStart);
    }
  }

  const isLong = detail.length > 200;

  return (
    <>
      <div
        onClick={isLong ? () => setShowModal(true) : undefined}
        className={`rounded-[10px] border border-[rgba(255,66,69,0.3)] bg-[rgba(255,66,69,0.06)] dark:bg-[rgba(255,66,69,0.1)] px-3.5 py-2.5 max-w-[640px] ${
          isLong ? "cursor-pointer" : ""
        }`}
      >
        <div className="flex items-start gap-2">
          <AlertCircle
            size={14}
            className="text-[#ff4245] flex-shrink-0 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-[#ff4245]">{brief}</p>
              {isLong && (
                <ChevronRight
                  size={12}
                  className="text-[var(--label-tertiary)] flex-shrink-0"
                />
              )}
            </div>
            {detail && !isLong && (
              <p className="text-[11px] text-[var(--label-secondary)] mt-1.5 break-all whitespace-pre-wrap">
                {detail}
              </p>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <ModalShell
          title={t("error.title")}
          onClose={() => setShowModal(false)}
        >
          <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-auto">
            {/* 顶部图标 + 状态码 */}
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-10 h-10 rounded-full bg-[rgba(255,66,69,0.1)] dark:bg-[rgba(255,66,69,0.15)] flex items-center justify-center mb-3">
                <AlertCircle size={20} className="text-[#ff4245]" />
              </div>
              <p className="text-[15px] font-semibold text-[#ff4245]">
                {brief}
              </p>
            </div>
            {/* 错误信息 */}
            <div className="rounded-[10px] bg-[var(--fill-card)] p-4 space-y-3">
              <ErrorDetailRow label={t("error.message")} value={detail} />
              {errorType && (
                <ErrorDetailRow label={t("error.type")} value={errorType} />
              )}
              {requestId && (
                <ErrorDetailRow
                  label={t("error.requestId")}
                  value={requestId}
                  mono
                />
              )}
            </div>
          </div>
        </ModalShell>
      )}
    </>
  );
}

/** 错误详情行 */
function ErrorDetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] text-[var(--label-tertiary)] mb-0.5">{label}</p>
      <p
        className={`text-[14px] leading-[22px] text-[var(--label-primary)] break-all whitespace-pre-wrap ${
          mono ? "font-mono text-[13px] leading-[20px]" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
