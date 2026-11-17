import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { ModalShell } from "../../components/ui/ModalShell";
import { Popover } from "../../components/ui/Popover";
import { messageDateOptions } from "./timeFormat";
import { useMessageTiming } from "./useMessageTiming";

export function ReplyTime({
  timestamps,
  running,
}: {
  timestamps: (string | undefined)[];
  running: boolean;
}) {
  const { t } = useTranslation();
  const timing = useMessageTiming(timestamps, running);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setSheetOpen(false);
      setMobile(query.matches);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (!timing.range.length) return null;
  const summary = timing.duration
    ? t("conversation.replyDuration", { duration: timing.duration })
    : t("conversation.timeInfo");
  const trigger = (open: boolean, id?: string) => (
    <Button
      size="inline"
      title={t("conversation.viewReplyTime")}
      aria-label={`${t("conversation.viewReplyTime")}: ${summary}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      onClick={mobile ? () => setSheetOpen(true) : undefined}
      className="conversation-reply-time-trigger min-h-5 max-w-full px-0 text-left font-normal tabular-nums"
    >
      <span className="conversation-duration">{summary}</span>
    </Button>
  );
  const details = <ReplyTimeDetails timing={timing} running={running} />;

  return mobile ? (
    <>
      {trigger(sheetOpen)}
      <AnimatePresence>
        {sheetOpen && (
          <ModalShell
            title={t("conversation.replyTime")}
            sheetSizing="content"
            onClose={() => setSheetOpen(false)}
          >
            <div className="px-5 py-4">{details}</div>
          </ModalShell>
        )}
      </AnimatePresence>
    </>
  ) : (
    <Popover
      label={t("conversation.replyTime")}
      width={320}
      align="left"
      closeOnScroll
      trigger={({ open, id }) => trigger(open, id)}
    >
      {() => (
        <div className="p-3">
          <h2 className="mb-3 text-[13px] font-semibold text-[var(--label-primary)]">
            {t("conversation.replyTime")}
          </h2>
          {details}
        </div>
      )}
    </Popover>
  );
}

function ReplyTimeDetails({
  timing,
  running,
}: {
  timing: ReturnType<typeof useMessageTiming>;
  running: boolean;
}) {
  const { t, i18n } = useTranslation();
  const start = timing.range[0];
  const end = !running && timing.range.length > 1 ? timing.range.at(-1) : null;
  const formatTime = (time: typeof start | undefined) =>
    time ? (
      <time dateTime={time.value}>
        {time.date.toLocaleString(i18n.resolvedLanguage, messageDateOptions)}
      </time>
    ) : (
      t("conversation.timeUnavailable")
    );
  const rows = [
    { label: t("conversation.replyStart"), value: formatTime(start) },
    {
      label: t("conversation.replyEnd"),
      value: running
        ? t("conversation.replyNotEnded")
        : formatTime(end ?? undefined),
    },
    {
      label: t("conversation.durationLabel"),
      value: timing.duration ?? t("conversation.timeUnavailable"),
    },
  ];

  return (
    <dl className="space-y-3 text-[13px] leading-5">
      {rows.map(({ label, value }) => (
        <div
          key={label}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
        >
          <dt className="text-[var(--label-secondary)]">{label}</dt>
          <dd className="min-w-0 select-text tabular-nums text-[var(--label-primary)] [overflow-wrap:anywhere]">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
