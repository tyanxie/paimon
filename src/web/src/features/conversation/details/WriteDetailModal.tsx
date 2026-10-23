import { useTranslation } from "react-i18next";
import { ResultBlock } from "../../../components/ui/ContentBlock";
import { ModalShell } from "../../../components/ui/ModalShell";
import { MarkdownRenderer } from "../Markdown";
import { ToolModalTitle, ToolPendingIndicator, type DetailModalProps } from "../ToolDetailShared";
import { getLanguageFromPath, wrapInFence } from "../toolFormatting";

/** Write 工具专用弹窗 */
export function WriteDetailModal({
  name,
  args,
  result,
  durationDisplay,
  status,
  onClose,
}: DetailModalProps) {
  const { t } = useTranslation();
  const path = args.path ?? "";
  const content = args.content ?? "";
  const language = getLanguageFromPath(path);

  // markdown 文件直接渲染，其他文件用代码块
  const isMarkdown = language === "markdown";
  const contentBlock = isMarkdown ? null : wrapInFence(content, language ?? "");

  return (
    <ModalShell
      trailing={durationDisplay}
      title={<ToolModalTitle name={name} status={status} />}
      onClose={onClose}
    >
      {/* 地址栏 */}
      <div className="px-5 py-2 border-b border-[var(--separator)] bg-[var(--fill-quaternary)]">
        <p className="text-[13px] text-[var(--label-secondary)] break-all leading-[20px] font-mono">
          {path}
        </p>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-5 space-y-3 scrollbar-auto">
        {/* 文件内容 */}
        <section>
          <MarkdownRenderer content={isMarkdown ? content : contentBlock!} />
        </section>

        {/* 结果 */}
        {result !== null && (
          <section>
            <h4 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">
              {t("entries.result")}
            </h4>
            <ResultBlock error={result.isError}>{result.content}</ResultBlock>
          </section>
        )}

        {result === null && <ToolPendingIndicator status={status} />}
      </div>
    </ModalShell>
  );
}
