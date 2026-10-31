import { Layers, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function CompactingEntry() {
  const { t } = useTranslation();
  return (
    <div className="conversation-system" data-system-state="compacting">
      <div className="conversation-system-row" role="status">
        <Layers size={14} aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1">
          {t("conversation.compactingContext")}
        </span>
        <Loader2
          size={14}
          aria-hidden="true"
          className="shrink-0 animate-spin motion-reduce:animate-none"
        />
      </div>
    </div>
  );
}
