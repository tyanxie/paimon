import type { ImagePayload } from "@protocol/types";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageLightbox } from "../../components/ui/ImageLightbox";
import { MessageTime } from "./MessageTime";

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
      <div
        className="flex flex-col items-end gap-1 px-1 py-1 md:px-2"
        aria-label={t("conversation.you")}
      >
        <div className="max-w-[90%] rounded-surface bg-[var(--color-accent)] text-white md:max-w-[80%]">
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
                    className="block overflow-hidden rounded-inline transition-opacity hover:opacity-90 motion-reduce:transition-none"
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
            <p className="break-words whitespace-pre-wrap px-3 py-2 text-[14px] leading-[22px]">
              {text}
            </p>
          )}
          {!text && images.length > 0 && <div className="h-2" />}
        </div>
        <MessageTime timestamps={[timestamp]} />
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
