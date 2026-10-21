import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { calcPosition } from "../ui/Popover";

export function MessageTime({
  timestamps,
}: {
  timestamps: (string | undefined)[];
}) {
  const { t, i18n } = useTranslation();
  const [position, setPosition] = useState<ReturnType<
    typeof calcPosition
  > | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
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
  const formatted = range.map(({ date }) =>
    date.toLocaleString(i18n.resolvedLanguage),
  );
  const label = `${t("conversation.messageTime")}: ${formatted.join(" – ")}`;

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const outside = (event: PointerEvent) => {
      if (!buttonRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);

  if (!range.length) return null;
  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition(calcPosition(rect));
  };
  return (
    <>
      <Button
        size="badge"
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-describedby={position ? tooltipId : undefined}
        onMouseEnter={show}
        onMouseLeave={() => setPosition(null)}
        onFocus={show}
        onBlur={() => setPosition(null)}
        onClick={show}
        className="conversation-time inline-flex shrink-0 items-center justify-center text-[var(--label-secondary)] opacity-100 transition-opacity hover:bg-[var(--fill-quaternary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 motion-reduce:transition-none"
      >
        <Clock size={13} aria-hidden="true" />
      </Button>
      {position &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            className="glass-popover ui-floating pointer-events-none fixed z-50 max-w-[calc(100vw-24px)] px-3 py-2 text-[11px] text-[var(--label-primary)]"
            style={position}
          >
            {range.map(({ value }, index) => (
              <div key={value} className="flex flex-wrap gap-x-3 gap-y-1">
                {range.length > 1 && (
                  <span className="text-[var(--label-secondary)]">
                    {t(
                      index === 0
                        ? "conversation.replyStart"
                        : "conversation.replyEnd",
                    )}
                  </span>
                )}
                <time dateTime={value}>{formatted[index]}</time>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
