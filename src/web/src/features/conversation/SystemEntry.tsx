import { ChevronRight, GitBranch, Layers, Loader2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "../../components/ui/ModalShell";
import { markdownToPlainText } from "../../utils/markdown";
import { MarkdownRenderer } from "./Markdown";
import { MessageTime } from "./MessageTime";
import type { SystemEntryState } from "./types";

export function SystemEntry({ state }: { state: SystemEntryState }) {
  const { t } = useTranslation();
  const [showDetail, setShowDetail] = useState(false);
  const entry = state.status === "completed" ? state.entry : undefined;
  const summary = entry?.summary ?? "";
  const preview = useMemo(() => markdownToPlainText(summary), [summary]);
  const busy = state.status === "compacting" || state.status === "refreshing";
  const label = t(
    state.status === "compacting"
      ? "conversation.compactingContext"
      : state.status === "refreshing"
        ? "conversation.fetchingCompaction"
        : state.status === "failed"
          ? "conversation.compactionFailed"
          : state.status === "aborted"
            ? "conversation.compactionAborted"
            : state.status === "unavailable"
              ? "conversation.compactionUnavailable"
              : entry?.type === "compaction"
                ? "entries.contextCompacted"
                : "entries.branchSummary",
  );
  const Icon = entry?.type === "branch_summary" ? GitBranch : Layers;
  const message =
    state.status === "failed" || state.status === "aborted"
      ? state.message
      : undefined;
  const content = (
    <>
      <Icon size={14} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {(preview || message) && (
          <span className="conversation-system-preview">
            {preview || message}
          </span>
        )}
      </span>
      {busy ? (
        <Loader2
          size={14}
          aria-hidden="true"
          className="shrink-0 animate-spin motion-reduce:animate-none"
        />
      ) : summary ? (
        <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
      ) : null}
    </>
  );

  return (
    <>
      <div className="conversation-system-group space-y-1">
        <div
          className="conversation-system"
          data-system-state={entry?.type ?? state.status}
        >
          {entry ? (
            <button
              type="button"
              disabled={!summary}
              onClick={() => setShowDetail(true)}
              className="conversation-system-row w-full text-left enabled:hover:bg-[var(--fill-quaternary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            >
              {content}
            </button>
          ) : (
            <div className="conversation-system-row" role="status">
              {content}
            </div>
          )}
        </div>
        {entry && (
          <div className="conversation-system-time px-1 md:px-2">
            <MessageTime timestamps={[entry.timestamp]} />
          </div>
        )}
      </div>
      <AnimatePresence>
        {showDetail && entry && (
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
