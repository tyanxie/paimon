import {
  CircleCheck,
  CircleHelp,
  CircleStop,
  CircleX,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ConversationToolState } from "../../stores/types";

type ToolStatus = ConversationToolState["status"];

const labels: Record<ToolStatus, string> = {
  pending: "conversation.toolPending",
  running: "entries.running",
  completed: "conversation.toolCompleted",
  error: "conversation.toolFailed",
  aborted: "entries.aborted",
  unknown: "conversation.toolUnknown",
};

const countLabels: Record<ToolStatus, string> = {
  pending: "conversation.toolsPending",
  running: "conversation.toolsRunning",
  completed: "conversation.toolsCompleted",
  error: "conversation.toolsFailed",
  aborted: "conversation.toolsAborted",
  unknown: "conversation.toolsUnknown",
};

const icons = {
  pending: Loader2,
  running: Loader2,
  completed: CircleCheck,
  error: CircleX,
  aborted: CircleStop,
  unknown: CircleHelp,
};

const colors: Record<ToolStatus, string> = {
  pending: "var(--label-secondary)",
  running: "var(--label-secondary)",
  completed: "var(--toast-icon-success)",
  error: "var(--toast-icon-error)",
  aborted: "var(--label-secondary)",
  unknown: "var(--label-secondary)",
};

export function useToolStatusLabel(status: ToolStatus, count?: number) {
  const { t } = useTranslation();
  return count === undefined
    ? t(labels[status])
    : t(countLabels[status], { count });
}

/** 列表、执行摘要和详情共用状态形状与说明。 */
export function ToolStatusIndicator({
  status,
  count,
  description,
}: {
  status: ToolStatus;
  count?: number;
  description?: string;
}) {
  const statusLabel = useToolStatusLabel(status, count);
  const label = description ?? statusLabel;
  const Icon = icons[status];
  const processing = status === "pending" || status === "running";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-tool-status={status}
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums"
    >
      <Icon
        size={14}
        aria-hidden="true"
        style={{ color: colors[status] }}
        className={
          processing ? "animate-spin motion-reduce:animate-none" : undefined
        }
      />
      {count !== undefined && <span aria-hidden="true">{count}</span>}
    </span>
  );
}
