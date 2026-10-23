import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ToolStatusIndicator, useToolStatusLabel } from "./ToolStatus";
import type { ConversationToolState, ToolResult } from "./types";

export interface DetailModalProps {
  name: string;
  args: Record<string, unknown>;
  result: ToolResult | null;
  durationDisplay: ReactNode;
  status: ConversationToolState["status"];
  onClose: () => void;
}

/** 缺少结果时展示当前阶段与说明。 */
export function ToolPendingIndicator({
  status,
}: {
  status: ConversationToolState["status"];
}) {
  const { t } = useTranslation();
  const label = useToolStatusLabel(status);
  return (
    <div className="space-y-1 text-[12px] text-[var(--label-secondary)]">
      <p>{label}</p>
      {status === "unknown" && (
        <p>{t("conversation.toolUnavailableDescription")}</p>
      )}
    </div>
  );
}

/** 工具详情沿用列表的状态与名称顺序。 */
export function ToolModalTitle({
  name,
  status,
}: {
  name: string;
  status: ConversationToolState["status"];
}) {
  return (
    <>
      <ToolStatusIndicator status={status} />
      {name}
    </>
  );
}
