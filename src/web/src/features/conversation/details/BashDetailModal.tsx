import { useTranslation } from "react-i18next";
import { ResultBlock } from "../../../components/ui/ContentBlock";
import { ModalShell } from "../../../components/ui/ModalShell";
import { MarkdownRenderer } from "../Markdown";
import { ToolModalTitle, ToolPendingIndicator, type DetailModalProps } from "../ToolDetailShared";
import { wrapInFence } from "../toolFormatting";

/** Bash 工具专用弹窗 */
export function BashDetailModal({
  name,
  args,
  result,
  durationDisplay,
  status,
  onClose,
}: DetailModalProps) {
  const { t } = useTranslation();
  const command = args.command ?? "";
  const timeout = args.timeout as number | undefined;

  // command 用 bash 代码块渲染
  const commandBlock = wrapInFence(command, "bash");
  // result 用 plaintext 代码块渲染
  const resultBlock =
    result && !result.isError
      ? wrapInFence(result.content.trim(), "plaintext")
      : null;

  return (
    <ModalShell
      title={<ToolModalTitle name={name} status={status} />}
      onClose={onClose}
      trailing={durationDisplay}
    >
      {/* 内容区：命令 + 结果单一滚动 */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-auto">
        {/* 命令块 */}
        <div className="px-5 pt-3 pb-3 bg-[var(--fill-quaternary)]">
          {timeout != null && (
            <p className="mb-2 text-[11px] text-[var(--label-tertiary)]">
              {t("entries.timeout")}
              {": "}
              <span className="whitespace-nowrap">{`${timeout}\u00a0s`}</span>
            </p>
          )}
          <MarkdownRenderer content={commandBlock} />
        </div>

        {/* 结果块 */}
        <div className="px-5 pt-3 pb-5">
          <h4 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide mb-2">
            {t("entries.output")}
          </h4>
          {result !== null ? (
            result.isError ? (
              <ResultBlock error>{result.content}</ResultBlock>
            ) : (
              <MarkdownRenderer content={resultBlock!} />
            )
          ) : (
            <ToolPendingIndicator status={status} />
          )}
        </div>
      </div>
    </ModalShell>
  );
}
