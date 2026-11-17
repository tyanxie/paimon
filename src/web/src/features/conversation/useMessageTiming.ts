import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function useMessageTiming(
  timestamps: (string | undefined)[],
  running = false,
) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(Date.now);
  const startedAt = timestamps[0] ? Date.parse(timestamps[0]) : undefined;
  useEffect(() => {
    if (!running || startedAt === undefined || !Number.isFinite(startedAt))
      return;
    const elapsed = Math.max(0, Date.now() - startedAt);
    const baseline = performance.now();
    const update = () =>
      setNow(startedAt + elapsed + performance.now() - baseline);
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);

  const times = timestamps
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, date: new Date(value) }))
    .filter(({ date }) => Number.isFinite(date.getTime()));
  const first = times[0];
  const last = times.at(-1);
  const range =
    first && last && times.length > 1 ? [first, last] : first ? [first] : [];
  const durationMs = first
    ? running
      ? Math.max(0, now - first.date.getTime())
      : last
        ? last.date.getTime() - first.date.getTime()
        : 0
    : 0;
  const formatUnit = (unit: string, value: number) =>
    t(`conversation.duration${unit}`, {
      count: value,
      value: new Intl.NumberFormat(i18n.resolvedLanguage).format(value),
    });
  let duration: string | null = null;
  if (first && (running || range.length > 1) && durationMs >= 0) {
    if (durationMs < 60000) {
      duration = formatUnit(
        "Seconds",
        Math.max(1, Math.floor(durationMs / 1000)),
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
  }

  return { range, duration };
}
