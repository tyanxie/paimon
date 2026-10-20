import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { AlertCircle, ChevronRight, GitBranch, Layers } from "lucide-react";
import type { ImagePayload } from "../../../../protocol/types";
import { MarkdownRenderer } from "./Markdown";
import { MessageTime } from "./MessageTime";
import { ModalShell } from "../ui/ModalShell";
import { ImageLightbox } from "../ui/ImageLightbox";
import { useTranslation } from "react-i18next";

export function UserBubble({
  content,
  timestamp,
}: {
  content: unknown;
  timestamp?: string;
}) {
  const { t } = useTranslation();
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  let text = "";
  let images: ImagePayload[] = [];
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    images = content.filter((block) => block.type === "image");
  } else {
    text = JSON.stringify(content);
  }

  return (
    <>
      <div className="group flex flex-col items-end gap-1 px-1 py-2 md:px-2">
        <div className="flex items-center gap-1 text-[11px] font-medium text-[var(--label-secondary)] select-none">
          {t("conversation.you")}
          <MessageTime timestamps={[timestamp]} />
        </div>
        <div className="max-w-[90%] rounded-[20px] rounded-br-[6px] bg-[var(--color-accent)] text-white md:max-w-[80%]">
          {images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 pb-0">
              {images.map((image, index) => {
                const src = `data:${image.mimeType};base64,${image.data}`;
                const label = t("conversation.attachedImage", {
                  count: index + 1,
                });
                return (
                  <button
                    key={index}
                    type="button"
                    aria-label={label}
                    onClick={() => setLightboxSrc(src)}
                    className="block overflow-hidden rounded-[10px] transition-opacity hover:opacity-90 motion-reduce:transition-none"
                  >
                    <img
                      src={src}
                      alt={label}
                      className="max-h-[150px] max-w-[200px] object-cover"
                      draggable={false}
                    />
                  </button>
                );
              })}
            </div>
          )}
          {text && (
            <p className="break-words whitespace-pre-wrap px-4 py-2.5 text-[14px] leading-[22px]">
              {text}
            </p>
          )}
          {!text && images.length > 0 && <div className="h-2" />}
        </div>
      </div>
      <AnimatePresence>
        {lightboxSrc && (
          <ImageLightbox
            key="image"
            src={lightboxSrc}
            onClose={() => setLightboxSrc(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export function MetaEntry({
  type,
  summary,
  timestamp,
}: {
  type: string;
  summary: string;
  timestamp?: string;
}) {
  const { t } = useTranslation();
  const [showDetail, setShowDetail] = useState(false);
  const label =
    type === "compaction"
      ? t("entries.contextCompacted")
      : t("entries.branchSummary");
  const Icon = type === "compaction" ? Layers : GitBranch;
  return (
    <>
      <div className="group conversation-system flex items-start gap-2 rounded-[14px] border border-[var(--separator)] bg-[var(--fill-quaternary)] px-3 py-2">
        <button
          type="button"
          disabled={!summary}
          onClick={() => setShowDetail(true)}
          className="flex min-w-0 flex-1 items-start gap-2 py-1 text-left focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        >
          <Icon
            size={14}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[var(--label-secondary)]"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-medium text-[var(--label-secondary)]">
              {label}
            </span>
            {summary && (
              <span className="mt-1 block truncate text-[12px] text-[var(--label-secondary)]">
                {summary}
              </span>
            )}
          </span>
          {summary && (
            <ChevronRight
              size={14}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--label-secondary)]"
            />
          )}
        </button>
        <MessageTime timestamps={[timestamp]} />
      </div>
      <AnimatePresence>
        {showDetail && (
          <ModalShell
            key="summary"
            title={label}
            onClose={() => setShowDetail(false)}
          >
            <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-auto">
              <MarkdownRenderer content={summary} />
            </div>
          </ModalShell>
        )}
      </AnimatePresence>
    </>
  );
}

/** API 错误卡片 */
export function ErrorCard({
  message,
  onReEdit,
}: {
  message: string;
  onReEdit?: () => void;
}) {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);
  let brief = message;
  let detail = "";
  let errorType = "";
  let requestId = "";
  const jsonStart = message.indexOf("{");
  if (jsonStart > 0) {
    brief = message.slice(0, jsonStart).trim();
    try {
      const parsed = JSON.parse(message.slice(jsonStart));
      detail = parsed?.error?.message ?? message.slice(jsonStart);
      errorType = parsed?.error?.type ?? "";
      const reqIdMatch = detail.match(/request id:\s*([\w]+)/i);
      if (reqIdMatch) requestId = reqIdMatch[1];
    } catch {
      detail = message.slice(jsonStart);
    }
  }
  const isLong = detail.length > 200;
  return (
    <>
      <div className="rounded-[12px] border border-[rgba(255,66,69,0.3)] bg-[rgba(255,66,69,0.06)] px-3.5 py-2.5">
        <div className="flex items-start gap-2">
          <AlertCircle
            size={14}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[#ff4245]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium text-[#ff4245]">{brief}</p>
              <div className="flex shrink-0 items-center gap-2">
                {onReEdit && (
                  <button
                    type="button"
                    onClick={onReEdit}
                    className="select-none text-[12px] text-[var(--color-accent)] hover:opacity-70"
                  >
                    {t("reEdit.button")}
                  </button>
                )}
                {isLong && (
                  <button
                    type="button"
                    aria-label={t("error.title")}
                    onClick={() => setShowModal(true)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--label-secondary)]"
                  >
                    <ChevronRight size={14} />
                  </button>
                )}
              </div>
            </div>
            {detail && !isLong && (
              <p className="mt-1.5 break-all whitespace-pre-wrap text-[11px] text-[var(--label-secondary)]">
                {detail}
              </p>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {showModal && (
          <ModalShell
            key="error"
            title={t("error.title")}
            onClose={() => setShowModal(false)}
          >
            <div className="flex-1 overflow-y-auto px-5 py-6 scrollbar-auto">
              <div className="mb-5 flex flex-col items-center text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(255,66,69,0.1)]">
                  <AlertCircle size={20} className="text-[#ff4245]" />
                </div>
                <p className="text-[15px] font-semibold text-[#ff4245]">
                  {brief}
                </p>
              </div>
              <div className="space-y-3 rounded-[10px] bg-[var(--fill-card)] p-4">
                <ErrorDetailRow label={t("error.message")} value={detail} />
                {errorType && (
                  <ErrorDetailRow label={t("error.type")} value={errorType} />
                )}
                {requestId && (
                  <ErrorDetailRow
                    label={t("error.requestId")}
                    value={requestId}
                    mono
                  />
                )}
              </div>
            </div>
          </ModalShell>
        )}
      </AnimatePresence>
    </>
  );
}

function ErrorDetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="mb-0.5 text-[11px] text-[var(--label-tertiary)]">{label}</p>
      <p
        className={`break-all whitespace-pre-wrap text-[14px] leading-[22px] text-[var(--label-primary)] ${mono ? "font-mono text-[13px] leading-[20px]" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
