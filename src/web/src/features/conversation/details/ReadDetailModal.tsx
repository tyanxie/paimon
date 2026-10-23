import { ResultBlock } from "../../../components/ui/ContentBlock";
import { ModalShell } from "../../../components/ui/ModalShell";
import { MarkdownRenderer } from "../Markdown";
import { ToolModalTitle, ToolPendingIndicator, type DetailModalProps } from "../ToolDetailShared";
import { getLanguageFromPath, wrapInFence } from "../toolFormatting";

/** Read 工具专用弹窗 */
export function ReadDetailModal({
  name,
  args,
  result,
  durationDisplay,
  status,
  onClose,
}: DetailModalProps) {
  const path = args.path ?? "";
  const offset = args.offset as number | undefined;
  const limit = args.limit as number | undefined;
  const language = getLanguageFromPath(path);

  // 构造地址栏文本
  let addressText = path;
  if (offset != null || limit != null) {
    const start = offset ?? "";
    const end = limit != null ? (offset ?? 1) + limit - 1 : "";
    addressText += ` [${start}:${end}]`;
  }

  // markdown 文件直接渲染，其他文件用代码块
  const isMarkdown = language === "markdown";
  const codeBlock =
    result && !result.isError && !isMarkdown
      ? wrapInFence(result.content, language ?? "")
      : null;

  return (
    <ModalShell
      title={<ToolModalTitle name={name} status={status} />}
      onClose={onClose}
      trailing={durationDisplay}
    >
      {/* 地址栏 */}
      <div className="px-5 py-2 border-b border-[var(--separator)] bg-[var(--fill-quaternary)]">
        <p className="text-[13px] text-[var(--label-secondary)] break-all leading-[20px] font-mono">
          {addressText}
        </p>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-5 scrollbar-auto">
        {result !== null ? (
          result.isError ? (
            <ResultBlock error>{result.content}</ResultBlock>
          ) : isMarkdown ? (
            <MarkdownRenderer content={result.content} />
          ) : (
            <MarkdownRenderer content={codeBlock!} />
          )
        ) : (
          <ToolPendingIndicator status={status} />
        )}
      </div>
    </ModalShell>
  );
}
