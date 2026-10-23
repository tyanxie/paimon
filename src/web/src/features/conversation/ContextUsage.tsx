import type { ContextUsageInfo } from "@protocol/types";
import { Gauge } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Popover } from "../../components/ui/Popover";

/** 上下文读数与完整用量 */
export function ContextIndicator({
  contextUsage,
}: {
  contextUsage: ContextUsageInfo;
}) {
  const { t } = useTranslation();
  const { tokens, contextWindow, percent } = contextUsage;
  const known = tokens != null && percent != null;
  const color = known
    ? percent > 90
      ? "var(--toast-icon-error)"
      : percent > 60
        ? "var(--toast-icon-warning)"
        : "var(--toast-icon-success)"
    : "var(--label-secondary)";
  const fmt = (value: number) => {
    if (value < 1000) return String(value);
    if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
    if (value < 1000000) return `${Math.round(value / 1000)}k`;
    return `${Number((value / 1000000).toFixed(1))}M`;
  };
  const description = known
    ? `${fmt(tokens)} / ${fmt(contextWindow)} (${Math.round(percent)}%)`
    : t("composer.pendingUsage");
  return (
    <Popover
      label={t("composer.contextUsage")}
      width={260}
      trigger={({ open, id }) => (
        <Button
          size="compact"
          type="button"
          title={description}
          aria-label={`${t("composer.contextUsage")}: ${description}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          className="composer-control composer-context shrink-0 tabular-nums focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          style={{ color }}
        >
          <Gauge size={14} aria-hidden="true" />
          {known && (
            <span className="composer-context-detail select-text">
              {fmt(tokens)} / {fmt(contextWindow)}
            </span>
          )}
          <span className="select-text">
            {known ? `${Math.round(percent)}%` : "—"}
          </span>
        </Button>
      )}
    >
      {() => <ContextDetails contextUsage={contextUsage} />}
    </Popover>
  );
}

function ContextDetails({ contextUsage }: { contextUsage: ContextUsageInfo }) {
  const { t, i18n } = useTranslation();
  const { tokens, contextWindow, percent } = contextUsage;
  const format = new Intl.NumberFormat(i18n.resolvedLanguage ?? "zh-CN");
  const known = tokens != null && percent != null;
  return (
    <div className="p-3 text-[12px] text-[var(--label-secondary)]">
      <h2 className="mb-3 text-[13px] font-semibold text-[var(--label-primary)]">
        {t("composer.contextUsage")}
      </h2>
      <dl className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <dt>{t("composer.usedTokens")}</dt>
          <dd className="select-text tabular-nums text-[var(--label-primary)]">
            {known ? format.format(tokens) : t("composer.pendingUsage")}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt>{t("composer.contextWindow")}</dt>
          <dd className="select-text tabular-nums text-[var(--label-primary)]">
            {format.format(contextWindow)}
          </dd>
        </div>
      </dl>
      {known ? (
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--fill-secondary)]"
          role="progressbar"
          aria-label={t("composer.contextUsage")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(0, percent))}
        >
          <div
            className="h-full rounded-full bg-[var(--color-accent)]"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      ) : (
        <p className="mt-3 leading-[18px]">
          {t("composer.pendingUsageDescription")}
        </p>
      )}
    </div>
  );
}
