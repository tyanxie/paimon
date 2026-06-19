// 压缩上下文确认弹窗：输入可选自定义提示词后触发压缩

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "./ModalShell";

interface CompactModalProps {
  onClose: () => void;
  onConfirm: (customInstructions?: string) => void;
}

export function CompactModal({ onClose, onConfirm }: CompactModalProps) {
  const { t } = useTranslation();
  const [instructions, setInstructions] = useState("");

  const handleConfirm = useCallback(() => {
    onConfirm(instructions.trim() || undefined);
  }, [instructions, onConfirm]);

  return (
    <ModalShell title={t("compact.title")} onClose={onClose}>
      <div className="px-5 py-4 space-y-3">
        <p className="text-[13px] leading-[18px] text-[var(--label-secondary)] select-none">
          {t("compact.description")}
        </p>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={t("compact.placeholder")}
          rows={3}
          className="w-full px-3 py-2 rounded-[10px] bg-[var(--fill-tertiary)] border border-[var(--separator)] text-[14px] leading-[20px] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] outline-none resize-none focus:border-[var(--color-accent)] transition-colors"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-[8px] text-[13px] text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)] transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            className="px-3.5 py-1.5 rounded-[8px] text-[13px] font-medium text-white bg-[var(--color-accent)] hover:opacity-90 active:opacity-80 transition-opacity"
          >
            {t("compact.start")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
