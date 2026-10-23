import type { ReactNode } from "react";
import { AlertCircle, Info, LoaderCircle } from "lucide-react";

export function StatusMessage({
  children,
  detail,
  tone = "neutral",
  compact = false,
  className = "",
}: {
  children: ReactNode;
  detail?: ReactNode;
  tone?: "neutral" | "loading" | "error";
  compact?: boolean;
  className?: string;
}) {
  const Icon =
    tone === "loading" ? LoaderCircle : tone === "error" ? AlertCircle : Info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`ui-status ${tone === "error" ? "select-text" : "select-none"} ${compact ? "ui-status--compact" : ""} ${className}`}
      data-tone={tone}
    >
      <Icon
        size={compact ? 16 : 20}
        className={`shrink-0 ${tone === "loading" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <div>{children}</div>
        {detail && <div className="ui-status-detail">{detail}</div>}
      </div>
    </div>
  );
}
