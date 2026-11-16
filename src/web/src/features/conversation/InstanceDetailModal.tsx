import { Check, CircleAlert } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { InstanceInfo } from "../../../../protocol/types";
import { Button } from "../../components/ui/Button";
import { ModalShell } from "../../components/ui/ModalShell";
import {
  getInstanceStatusDotClass,
  getInstanceStatusKey,
} from "../../utils/status";

interface InstanceDetailModalProps {
  instance: InstanceInfo;
  onClose: () => void;
}

function DetailRow({
  label,
  children,
  feedback,
}: {
  label: string;
  children: ReactNode;
  feedback?: "copied" | "failed" | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid min-w-0 gap-1.5 border-b border-[var(--separator)] py-3 last:border-b-0 sm:grid-cols-[100px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-[12px] leading-[22px] text-[var(--label-secondary)] select-none">
        {label}
      </dt>
      <dd className="relative min-w-0 text-[13px] leading-[22px] text-[var(--label-primary)]">
        {feedback && (
          <span
            className={`absolute right-full top-[11px] mr-1 -translate-y-1/2 ${feedback === "failed" ? "text-[var(--toast-icon-error)]" : "text-[var(--toast-icon-success)]"}`}
            title={
              feedback === "copied"
                ? t("entries.copied")
                : t("instanceDetails.copyFailed")
            }
            aria-hidden="true"
          >
            {feedback === "copied" ? (
              <Check size={12} />
            ) : (
              <CircleAlert size={12} />
            )}
          </span>
        )}
        <span role="status" className="sr-only">
          {feedback === "copied" && `${label}：${t("entries.copied")}`}
          {feedback === "failed" &&
            `${label}：${t("instanceDetails.copyFailed")}`}
        </span>
        {children}
      </dd>
    </div>
  );
}

function CopyableRow({
  label,
  value,
  children,
  mono = false,
}: {
  label: string;
  value: string;
  children?: ReactNode;
  mono?: boolean;
}) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState<"copied" | "failed" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy() {
    let result: "copied" | "failed";
    try {
      await navigator.clipboard.writeText(value);
      result = "copied";
    } catch {
      result = "failed";
    }
    if (!activeRef.current) return;
    setFeedback(result);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFeedback(null), 1500);
  }

  return (
    <DetailRow label={label} feedback={feedback}>
      <Button
        size="inline"
        onClick={handleCopy}
        title={t("instanceDetails.copyValue", { label })}
        aria-label={t("instanceDetails.copyValue", { label })}
        className="-mx-1 w-full items-start text-left font-normal text-[var(--label-primary)] active:bg-[var(--fill-secondary)]"
      >
        <span
          className={`w-full whitespace-pre-wrap [overflow-wrap:anywhere] ${mono ? "font-mono" : ""}`}
        >
          {children ?? value}
        </span>
      </Button>
    </DetailRow>
  );
}

export function InstanceDetailModal({
  instance,
  onClose,
}: InstanceDetailModalProps) {
  const { t, i18n } = useTranslation();
  const modelId = `${instance.model.provider}/${instance.model.id}`;
  const createdAt = instance.sessionCreatedAt
    ? new Date(instance.sessionCreatedAt)
    : null;

  return (
    <ModalShell title={t("instanceDetails.title")} onClose={onClose}>
      <div className="px-5 py-3">
        <dl>
          <DetailRow label={t("instanceDetails.status")}>
            <span className="inline-flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${getInstanceStatusDotClass(instance.status)}`}
                aria-hidden="true"
              />
              {t(getInstanceStatusKey(instance.status))}
            </span>
          </DetailRow>
          <CopyableRow
            key={modelId}
            label={t("instanceDetails.model")}
            value={modelId}
          >
            {instance.model.name && (
              <span className="block">{instance.model.name}</span>
            )}
            <span className="block font-mono text-[12px] text-[var(--label-secondary)]">
              {modelId}
            </span>
          </CopyableRow>
          <CopyableRow
            label={t("instanceDetails.hostname")}
            value={instance.hostname}
          />
          <CopyableRow
            label={t("instanceDetails.processId")}
            value={String(instance.pid)}
            mono
          />
          <CopyableRow
            label={t("instanceDetails.cwd")}
            value={instance.cwd}
            mono
          />
          {instance.sessionId && (
            <CopyableRow
              key={instance.sessionId}
              label={t("instanceDetails.sessionId")}
              value={instance.sessionId}
              mono
            />
          )}
          {instance.sessionFile && (
            <CopyableRow
              key={instance.sessionFile}
              label={t("instanceDetails.sessionFile")}
              value={instance.sessionFile}
              mono
            />
          )}
          {createdAt && (
            <DetailRow label={t("instanceDetails.createdAt")}>
              <time dateTime={instance.sessionCreatedAt}>
                {createdAt.toLocaleString(i18n.resolvedLanguage)}
              </time>
            </DetailRow>
          )}
        </dl>
      </div>
    </ModalShell>
  );
}
