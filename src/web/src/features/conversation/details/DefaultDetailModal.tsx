import { useTranslation } from "react-i18next";
import { ResultBlock } from "../../../components/ui/ContentBlock";
import { ModalShell } from "../../../components/ui/ModalShell";
import { ToolModalTitle, ToolPendingIndicator, type DetailModalProps } from "../ToolDetailShared";

/** 默认通用弹窗（JSON args + 纯文本 result） */
export function DefaultDetailModal({
  name,
  args,
  result,
  durationDisplay,
  status,
  onClose,
}: DetailModalProps) {
  const { t } = useTranslation();
  return (
    <ModalShell
      title={<ToolModalTitle name={name} status={status} />}
      onClose={onClose}
      trailing={durationDisplay}
    >
      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-5 space-y-3 scrollbar-auto">
        {/* 参数 */}
        <section>
          <h4 className="text-[11px] font-semibold text-[var(--label-tertiary)] uppercase tracking-wide mb-1.5">
            {t("entries.params")}
          </h4>
          <ResultBlock>{JSON.stringify(args, null, 2)}</ResultBlock>
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

        {result === null && (
          <section>
            <ToolPendingIndicator status={status} />
          </section>
        )}
      </div>
    </ModalShell>
  );
}
