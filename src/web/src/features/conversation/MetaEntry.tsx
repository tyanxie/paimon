import { ChevronRight, GitBranch, Layers } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "../../components/ui/ModalShell";
import { MarkdownRenderer } from "./Markdown";
import { MessageTime } from "./MessageTime";
import { markdownToPlainText } from "../../utils/markdown";

export function MetaEntry({
  type,
  summary,
  timestamp,
}: {
  type: string;
  summary: string;
  timestamp?: string;
}) {
  const { t } = useTranslation();
  const [showDetail, setShowDetail] = useState(false);
  const preview = useMemo(() => markdownToPlainText(summary), [summary]);
  const label =
    type === "compaction"
      ? t("entries.contextCompacted")
      : t("entries.branchSummary");
  const Icon = type === "compaction" ? Layers : GitBranch;
  return (
    <>
      <div className="conversation-system-group space-y-1">
        <div className="conversation-system" data-system-state={type}>
          <button
            type="button"
            disabled={!summary}
            onClick={() => setShowDetail(true)}
            className="conversation-system-row w-full text-left enabled:hover:bg-[var(--fill-quaternary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            <Icon size={14} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block">{label}</span>
              {preview && (
                <span className="conversation-system-preview">{preview}</span>
              )}
            </span>
            {summary && (
              <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
            )}
          </button>
        </div>
        <div className="conversation-system-time px-1 md:px-2">
          <MessageTime timestamps={[timestamp]} />
        </div>
      </div>
      <AnimatePresence>
        {showDetail && (
          <ModalShell
            key="summary"
            title={label}
            onClose={() => setShowDetail(false)}
          >
            <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-auto">
              <MarkdownRenderer content={summary} />
            </div>
          </ModalShell>
        )}
      </AnimatePresence>
    </>
  );
}
