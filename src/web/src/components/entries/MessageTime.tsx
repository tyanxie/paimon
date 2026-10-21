import { useTranslation } from "react-i18next";

export function MessageTime({
  timestamps,
  showRange = false,
  showDuration = false,
}: {
  timestamps: (string | undefined)[];
  showRange?: boolean;
  showDuration?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const times = timestamps
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, date: new Date(value) }))
    .filter(({ date }) => Number.isFinite(date.getTime()));
  const first = times[0];
  const last = times.at(-1);
  const range =
    first && last && first.value !== last.value
      ? [first, last]
      : first
        ? [first]
        : [];
  if (!range.length) return null;

  const dateOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  };
  const durationMs =
    first && last ? last.date.getTime() - first.date.getTime() : 0;
  const formatNumber = (value: number, maximumFractionDigits = 0) =>
    new Intl.NumberFormat(i18n.resolvedLanguage, {
      maximumFractionDigits,
    }).format(value);
  const formatUnit = (unit: string, value: number, precision = 0) =>
    t(`conversation.duration${unit}`, {
      count: value,
      value: formatNumber(value, precision),
    });
  let duration: string | null = null;
  if (showRange && showDuration && range.length > 1 && durationMs > 0) {
    if (durationMs < 1000) {
      duration = formatUnit("Milliseconds", durationMs);
    } else if (durationMs < 60000) {
      duration = formatUnit(
        "Seconds",
        Math.min(59.9, Math.round(durationMs / 100) / 10),
        1,
      );
    } else {
      const totalSeconds = Math.floor(durationMs / 1000);
      const units =
        totalSeconds < 3600
          ? ([
              ["Minutes", Math.floor(totalSeconds / 60)],
              ["Seconds", totalSeconds % 60],
            ] as const)
          : totalSeconds < 86400
            ? ([
                ["Hours", Math.floor(totalSeconds / 3600)],
                ["Minutes", Math.floor(totalSeconds / 60) % 60],
              ] as const)
            : ([
                ["Days", Math.floor(totalSeconds / 86400)],
                ["Hours", Math.floor(totalSeconds / 3600) % 24],
              ] as const);
      duration = units
        .filter(([, value]) => value > 0)
        .map(([unit, value]) => formatUnit(unit, value))
        .join(" ");
    }
    duration = t("conversation.approximateDuration", { duration });
  }

  return (
    <span className="conversation-time inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1 text-left text-[11px] tabular-nums text-[var(--label-secondary)] select-text">
      {(showRange ? range : range.slice(0, 1)).map(({ value, date }, index) => (
        <span
          key={value}
          className="inline-flex flex-wrap items-baseline gap-x-1"
        >
          {showRange && (
            <span>
              {t(
                index === 0
                  ? "conversation.replyStart"
                  : "conversation.replyEnd",
              )}
            </span>
          )}
          <time dateTime={value}>
            {date.toLocaleString(i18n.resolvedLanguage, dateOptions)}
          </time>
        </span>
      ))}
      {duration && <span className="conversation-duration">{duration}</span>}
    </span>
  );
}
