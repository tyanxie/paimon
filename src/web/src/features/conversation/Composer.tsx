// 消息输入区：textarea + 图片上传/粘贴/预览 + 工具栏 + 上下文用量 + 发送/停止

import { ArrowUp, Square, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import {
  useCallback,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import type {
  ImagePayload,
  InstanceInfo,
  ThinkingLevel,
} from "../../../../protocol/types";
import { Button } from "../../components/ui/Button";
import type { InputDraft, InputDraftUpdater } from "../../stores/useDrafts";
import {
  getInstanceStatusDotClass,
  getInstanceStatusKey,
  isBusy,
} from "../../utils/status";
import { CompactModal } from "./CompactModal";
import { ComposerToolbar } from "./ComposerToolbar";
import { ContextIndicator } from "./ContextUsage";
import { useComposerHeight } from "./useComposerHeight";
import { useComposerImages } from "./useComposerImages";

/** Composer 暴露给父组件的命令式 API */
export interface ComposerHandle {
  focus(): void;
}

interface ComposerProps {
  ref?: React.Ref<ComposerHandle>;
  instance: InstanceInfo | undefined;
  draft: InputDraft;
  onDraftChange: (value: InputDraftUpdater) => void;
  onSendMessage: (message: string, images?: ImagePayload[]) => void;
  onAbort: () => void;
  onSetModel: (provider: string, id: string) => void;
  onSetThinkingLevel: (level: ThinkingLevel) => void;
  onCompact: (customInstructions?: string) => void;
  buttonMode: "send" | "stop";
  showCompactButton: boolean;
  compactDisabled: boolean;
  onImageLightbox: (src: string) => void;
  startBottomFollow: () => void;
}

export function Composer({
  ref,
  instance,
  draft,
  onDraftChange,
  onSendMessage,
  onAbort,
  onSetModel,
  onSetThinkingLevel,
  onCompact,
  buttonMode,
  showCompactButton,
  compactDisabled,
  onImageLightbox,
  startBottomFollow,
}: ComposerProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const textareaId = useId();
  const heightHelpId = useId();
  const editorHeight = useComposerHeight(textareaRef, surfaceRef, draft.text);

  // 暴露 focus 方法给父组件
  useImperativeHandle(ref, () => ({
    focus() {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      // 光标移到末尾 + 滚动到底部
      const len = el.value.length;
      el.selectionStart = el.selectionEnd = len;
      el.scrollTop = el.scrollHeight;
    },
  }));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [showCompactModal, setShowCompactModal] = useState(false);

  // 从 instance 对象中取需要的字段
  const instanceStatus = instance?.status;
  const contextUsage = instance?.contextUsage;
  const resizeTextarea = editorHeight.resizeTextarea;

  // textarea 自动调整高度
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onDraftChange((prev) => ({ ...prev, text: e.target.value }));
      resizeTextarea(e.target);
    },
    [onDraftChange, resizeTextarea],
  );

  // 发送条件
  const canSend =
    !isBusy(instanceStatus) && (!!draft.text.trim() || draft.images.length > 0);

  // 发送消息
  const handleSend = useCallback(() => {
    const current = draftRef.current;
    if (
      isBusy(instanceStatus) ||
      (!current.text.trim() && current.images.length === 0)
    )
      return;
    const images: ImagePayload[] | undefined = current.images.length
      ? current.images.map((img) => ({
          data: img.data,
          mimeType: img.mimeType,
        }))
      : undefined;
    onSendMessage(current.text.trim(), images);
    startBottomFollow();
  }, [instanceStatus, onSendMessage, startBottomFollow]);

  // 键盘事件：Enter 发送，Shift+Enter 换行，IME 组合输入中不触发
  // keyCode 229 用于拦截 Safari 上 IME 确认拼音时的回车（此时 isComposing 已为 false）
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const { handlePaste, handleFileSelect, handleRemoveImage } = useComposerImages(onDraftChange);

  return (
    <>
      <div ref={surfaceRef} className="composer-surface">
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label={t("composer.resizeHeight")}
          aria-describedby={heightHelpId}
          aria-controls={textareaId}
          aria-valuemin={editorHeight.limits.minimum}
          aria-valuemax={editorHeight.limits.maximum}
          aria-valuenow={editorHeight.height}
          aria-valuetext={t("composer.heightPixels", {
            height: editorHeight.height,
          })}
          className="composer-resize-handle"
          data-dragging={editorHeight.dragging || undefined}
          onPointerDown={editorHeight.onPointerDown}
          onKeyDown={editorHeight.onKeyDown}
          onDoubleClick={editorHeight.resetHeight}
          title={t("composer.resizeHeightHelp")}
        >
          <span aria-hidden="true" />
        </div>
        <span id={heightHelpId} className="sr-only">
          {t("composer.resizeHeightHelp")}
        </span>
        {draft.images.length > 0 && (
          <div className="composer-images flex gap-2 overflow-x-auto px-4 pt-4 scrollbar-auto">
            {draft.images.map((img, index) => (
              <div key={img.id} className="relative shrink-0">
                <button
                  type="button"
                  aria-label={t("composer.previewImage", { count: index + 1 })}
                  onClick={() => onImageLightbox(img.previewUrl)}
                  className="block overflow-hidden rounded-content border border-[var(--separator)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                >
                  <img
                    src={img.previewUrl}
                    alt={t("conversation.attachedImage", { count: index + 1 })}
                    className="h-14 w-14 object-cover"
                    draggable={false}
                  />
                </button>
                <Button
                  size="badge"
                  type="button"
                  onClick={() => handleRemoveImage(img.id)}
                  className="absolute -right-1.5 -top-1.5 bg-[var(--badge-bg)] text-[var(--badge-text)] hover:bg-[var(--badge-bg-hover)]"
                  aria-label={t("composer.removeImage", { count: index + 1 })}
                >
                  <X size={12} aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <textarea
          id={textareaId}
          ref={textareaRef}
          rows={2}
          aria-label={t("eventStream.sendPlaceholder")}
          placeholder={t("eventStream.sendPlaceholder")}
          value={draft.text}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          className="composer-editor block w-full resize-none overflow-hidden bg-transparent text-[16px] leading-[24px] text-[var(--label-primary)] outline-none placeholder:text-[var(--label-tertiary)] md:text-[14px] md:leading-[22px]"
        />
        <div
          className="composer-toolbar flex min-w-0 items-center gap-2 px-3 pb-3 pt-2"
          role="group"
          aria-label={t("composer.options")}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <ComposerToolbar
            instance={instance}
            showCompactButton={showCompactButton}
            compactDisabled={compactDisabled}
            onSetModel={onSetModel}
            onSetThinkingLevel={onSetThinkingLevel}
            onAttachImages={() => fileInputRef.current?.click()}
            onOpenCompact={() => setShowCompactModal(true)}
          />
          <div className="composer-actions flex shrink-0 items-center gap-2">
            <span
              role="status"
              className="composer-agent-status inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] text-[var(--label-secondary)]"
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${getInstanceStatusDotClass(instanceStatus)}`}
              />
              {t(getInstanceStatusKey(instanceStatus))}
            </span>
            {contextUsage && <ContextIndicator contextUsage={contextUsage} />}
            {buttonMode === "stop" ? (
              <Button
                size="icon"
                type="button"
                onClick={onAbort}
                className="select-none shrink-0 rounded-full bg-[var(--toast-icon-error)] text-white transition-[opacity,transform] hover:opacity-90 active:scale-95 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] motion-reduce:transition-none motion-reduce:transform-none"
                title={t("eventStream.stop")}
                aria-label={t("eventStream.stop")}
              >
                <Square size={12} fill="currentColor" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                size="icon"
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                className={`select-none shrink-0 rounded-full transition-[opacity,transform] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] motion-reduce:transition-none motion-reduce:transform-none ${canSend ? "bg-[var(--color-accent)] text-white hover:opacity-90 active:scale-95" : "bg-[var(--fill-secondary)] text-[var(--label-tertiary)] opacity-50 cursor-default"}`}
                title={t("eventStream.send")}
                aria-label={t("eventStream.send")}
              >
                <ArrowUp size={16} strokeWidth={2.5} aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {showCompactModal && (
          <CompactModal
            key="compact"
            onClose={() => setShowCompactModal(false)}
            onConfirm={(customInstructions) => {
              onCompact(customInstructions);
              setShowCompactModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
