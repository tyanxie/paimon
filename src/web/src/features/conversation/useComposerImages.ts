import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { showToast } from "../../components/ui/Toast";
import type { InputDraftUpdater } from "../../stores/useDrafts";
import { getImagesFromClipboard, processImageFile } from "../../utils/image";

export function useComposerImages(
  onDraftChange: (value: InputDraftUpdater) => void,
) {
  const { t } = useTranslation();
  const appendImages = useCallback(
    (files: File[]) => {
      Promise.all(files.map(processImageFile))
        .then((processed) =>
          onDraftChange((previous) => ({
            ...previous,
            images: [...previous.images, ...processed],
          })),
        )
        .catch((error) => {
          showToast(t("eventStream.imageProcessFailed"), "error");
          console.error("Image process failed:", error);
        });
    },
    [onDraftChange, t],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = getImagesFromClipboard(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      appendImages(files);
    },
    [appendImages],
  );

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length === 0) return;
      appendImages(files);
      event.target.value = "";
    },
    [appendImages],
  );

  const handleRemoveImage = useCallback(
    (id: string) => {
      onDraftChange((previous) => ({
        ...previous,
        images: previous.images.filter((image) => image.id !== id),
      }));
    },
    [onDraftChange],
  );

  return { handlePaste, handleFileSelect, handleRemoveImage };
}
