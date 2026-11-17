import { useTranslation } from "react-i18next";
import { messageDateOptions } from "./timeFormat";

export function MessageTime({ timestamp }: { timestamp?: string }) {
  const { i18n } = useTranslation();
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;

  return (
    <span className="conversation-time inline-flex min-w-0 max-w-full text-left text-[11px] tabular-nums text-[var(--label-secondary)] select-text">
      <time dateTime={timestamp}>
        {date.toLocaleString(i18n.resolvedLanguage, messageDateOptions)}
      </time>
    </span>
  );
}
