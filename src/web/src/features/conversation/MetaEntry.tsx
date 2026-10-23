import { ChevronRight, GitBranch, Layers } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "../../components/ui/ModalShell";
import { MarkdownRenderer } from "./Markdown";
import { MessageTime } from "./MessageTime";

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
  const label =
    type === "compaction"
      ? t("entries.contextCompacted")
      : t("entries.branchSummary");
  const Icon = type === "compaction" ? Layers : GitBranch;
  return (
    <>
      <div className="conversation-system flex flex-wrap items-start gap-2 border-y border-[var(--separator)] px-3 py-2">
        <button
          type="button"
          disabled={!summary}
          onClick={() => setShowDetail(true)}
          className="flex min-w-0 flex-1 items-start gap-2 py-1 text-left focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        >
          <Icon
            size={14}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[var(--label-secondary)]"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium text-[var(--label-secondary)]">
              {label}
            </span>
            {summary && (
              <span className="mt-1 block truncate text-[12px] text-[var(--label-secondary)]">
                {summary}
              </span>
            )}
          </span>
          {summary && (
            <ChevronRight
              size={14}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--label-secondary)]"
            />
          )}
        </button>
        <MessageTime timestamps={[timestamp]} />
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
