import { ChevronRight, Timer } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ToolDetailModal } from "./ToolDetailModal";
import { ToolStatusIndicator, useToolStatusLabel } from "./ToolStatus";
import { getToolSummary } from "./toolFormatting";
import type { ToolPresentation } from "./types";

export function ToolCallCard({
  name,
  args,
  toolCallId,
  presentation,
  compact = false,
}: {
  name: string;
  args: Record<string, unknown>;
  toolCallId?: string;
  presentation: ToolPresentation;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  const summary = getToolSummary(name, args);

  const { status, result, startedAt } = presentation;
  const isCompleted = status === "completed" || status === "error";
  const statusLabel = useToolStatusLabel(status);
  const elapsed = useToolElapsed(status === "running" ? startedAt : undefined);
  const durationDisplay = (
    <ToolDuration
      elapsed={isCompleted ? result?.durationMs : elapsed}
      isFinal={isCompleted}
    />
  );

  return (
    <>
      {/* 折叠卡片 */}
      <button
        type="button"
        aria-label={`${t("conversation.toolDetails", { name })}: ${statusLabel}`}
        title={statusLabel}
        data-tool-state={status}
        onClick={() => setShowModal(true)}
        className={
          compact
            ? "conversation-tool-row flex w-full items-center gap-2 rounded-control px-3 py-1 text-left group select-none hover:bg-[var(--fill-quaternary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            : "w-full max-w-[640px] flex items-center gap-2.5 px-3 py-2 rounded-content bg-[var(--fill-card)] border border-[var(--separator)] hover:bg-[var(--fill-tertiary)] transition-colors text-left group select-none"
        }
      >
        <ToolStatusIndicator status={status} />
        <span className="text-[13px] font-medium text-[var(--label-primary)]">
          {name}
        </span>
        {summary && (
          <span className="text-[12px] text-[var(--label-tertiary)] truncate flex-1 min-w-0">
            {summary}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2.5 flex-shrink-0">
          {durationDisplay}
          <ChevronRight
            size={14}
            aria-hidden="true"
            className="text-[var(--label-tertiary)] group-hover:text-[var(--label-secondary)] transition-colors"
          />
        </span>
      </button>

      {/* 详情弹窗 */}
      <AnimatePresence>
        {showModal && (
          <ToolDetailModal
            key={toolCallId ?? name}
            name={name}
            args={args}
            result={result}
            durationDisplay={durationDisplay}
            status={status}
            onClose={() => setShowModal(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** 同一工具调用共享运行计时 */
function useToolElapsed(startedAt?: number): number | undefined {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt === undefined) return;
    const update = () => setElapsed(Math.max(0, performance.now() - startedAt));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return startedAt === undefined ? undefined : elapsed;
}

/** 工具调用等待时间和最终执行耗时 */
function ToolDuration({
  elapsed,
  isFinal,
}: {
  elapsed?: number;
  isFinal: boolean;
}) {
  const { t } = useTranslation();
  if (elapsed === undefined || !Number.isFinite(elapsed) || elapsed <= 0)
    return null;
  return (
    <span
      title={t(
        isFinal ? "entries.executionDuration" : "entries.waitingDuration",
      )}
      className="flex items-center gap-1 text-[11px] text-[var(--label-tertiary)] flex-shrink-0"
    >
      <Timer size={12} />
      {elapsed < 1000
        ? `${Math.max(1, Math.round(elapsed))}\u00a0ms`
        : `${(elapsed / 1000).toFixed(1)}\u00a0s`}
    </span>
  );
}
