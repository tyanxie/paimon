// 压缩上下文确认弹窗：输入可选自定义提示词后触发压缩

import { useState, useCallback, useId } from "react";
import { Button } from "./Button";
import { TextArea } from "./FormControls";
import { useTranslation } from "react-i18next";
import { ModalShell } from "./ModalShell";

interface CompactModalProps {
  onClose: () => void;
  onConfirm: (customInstructions?: string) => void;
}

export function CompactModal({ onClose, onConfirm }: CompactModalProps) {
  const { t } = useTranslation();
  const instructionsId = useId();
  const descriptionId = useId();
  const [instructions, setInstructions] = useState("");

  const handleConfirm = useCallback(() => {
    onConfirm(instructions.trim() || undefined);
  }, [instructions, onConfirm]);

  return (
    <ModalShell
      mobileSheet={false}
      size="form"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={handleConfirm}>
            {t("compact.start")}
          </Button>
        </>
      }
      title={t("compact.title")}
      onClose={onClose}
    >
      <div className="ui-form-content">
        <p id={descriptionId} className="ui-form-note">
          {t("compact.description")}
        </p>
        <TextArea
          id={instructionsId}
          aria-label={t("compact.placeholder")}
          aria-describedby={descriptionId}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={t("compact.placeholder")}
          rows={3}
        />
      </div>
    </ModalShell>
  );
}
