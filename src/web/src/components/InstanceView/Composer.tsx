// 消息输入区：textarea + 图片上传/粘贴/预览 + 工具栏 + 上下文用量 + 发送/停止

import { AnimatePresence } from "motion/react";
import {
  useRef,
  useCallback,
  useState,
  useId,
  useImperativeHandle,
} from "react";
import { ArrowUp, Square, Minimize2, ImagePlus, X, Gauge } from "lucide-react";
import type {
  InstanceInfo,
  ImagePayload,
  ContextUsageInfo,
  ThinkingLevel,
} from "../../../../protocol/types";
import type { InputDraft, InputDraftUpdater } from "../../stores/useDrafts";
import {
  getInstanceStatusDotClass,
  getInstanceStatusKey,
  isBusy,
} from "../../utils/status";
import { processImageFile, getImagesFromClipboard } from "../../utils/image";
import { showToast } from "../ui/Toast";
import { ModelSelector } from "../ui/ModelSelector";
import { ThinkingSelector } from "../ui/ThinkingSelector";
import { Button } from "../ui/Button";
import { useComposerHeight } from "./useComposerHeight";
import { Popover } from "../ui/Popover";
import { CompactModal } from "../ui/CompactModal";
import { useTranslation } from "react-i18next";

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
  const instanceModel = instance?.model;
  const availableModels = instance?.availableModels;
  const thinkingLevel = instance?.thinkingLevel;
  // 从 availableModels 中查找当前模型的可选思考等级
  const availableThinkingLevels = availableModels?.find(
    (m) => m.provider === instanceModel?.provider && m.id === instanceModel?.id,
  )?.availableThinkingLevels;

  const canCompact =
    showCompactButton &&
    !!contextUsage &&
    !compactDisabled &&
    contextUsage.tokens != null;
  const compactDescription = compactDisabled
    ? t("composer.compactBusy")
    : !showCompactButton || contextUsage?.tokens == null
      ? t("composer.compactUnavailable")
      : t("eventStream.compactContext");
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

  // 粘贴图片处理
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const files = getImagesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      Promise.all(files.map(processImageFile))
        .then((processed) => {
          onDraftChange((prev) => ({
            ...prev,
            images: [...prev.images, ...processed],
          }));
        })
        .catch((err) => {
          showToast(t("eventStream.imageProcessFailed"), "error");
          console.error("Image process failed:", err);
        });
    },
    [onDraftChange, t],
  );

  // 文件上传处理
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      Promise.all(files.map(processImageFile))
        .then((processed) => {
          onDraftChange((prev) => ({
            ...prev,
            images: [...prev.images, ...processed],
          }));
        })
        .catch((err) => {
          showToast(t("eventStream.imageProcessFailed"), "error");
          console.error("Image process failed:", err);
        });
      e.target.value = "";
    },
    [onDraftChange, t],
  );

  // 移除已附加的图片
  const handleRemoveImage = useCallback(
    (id: string) => {
      onDraftChange((prev) => ({
        ...prev,
        images: prev.images.filter((img) => img.id !== id),
      }));
    },
    [onDraftChange],
  );

  return (
    <>
      <div ref={surfaceRef} className="composer-surface glass-panel-input">
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
          <div className="composer-controls flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <Button
              size="compact"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="composer-control shrink-0"
              title={t("eventStream.attachImage")}
              aria-label={t("eventStream.attachImage")}
            >
              <ImagePlus size={14} aria-hidden="true" />
              <span>{t("composer.images")}</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            {instanceModel ? (
              <ModelSelector
                currentModel={instanceModel}
                availableModels={availableModels}
                onSelect={onSetModel}
                className="composer-control"
              />
            ) : (
              <Button size="compact" disabled className="composer-control">
                {t("composer.modelWaiting")}
              </Button>
            )}
            <ThinkingSelector
              currentLevel={thinkingLevel}
              pending={!instance}
              availableLevels={availableThinkingLevels ?? []}
              onSelect={onSetThinkingLevel}
              showLabel
              className="composer-control"
            />
            <Button
              size="compact"
              type="button"
              disabled={!canCompact}
              aria-label={t("eventStream.compactContext")}
              title={compactDescription}
              onClick={() => setShowCompactModal(true)}
              className="composer-control shrink-0"
            >
              <Minimize2 size={14} aria-hidden="true" />
              <span>{t("composer.compact")}</span>
            </Button>
          </div>
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

/** 上下文读数与完整用量 */
function ContextIndicator({
  contextUsage,
}: {
  contextUsage: ContextUsageInfo;
}) {
  const { t } = useTranslation();
  const { tokens, contextWindow, percent } = contextUsage;
  const known = tokens != null && percent != null;
  const color = known
    ? percent > 90
      ? "var(--toast-icon-error)"
      : percent > 60
        ? "var(--toast-icon-warning)"
        : "var(--toast-icon-success)"
    : "var(--label-secondary)";
  const fmt = (value: number) => {
    if (value < 1000) return String(value);
    if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
    if (value < 1000000) return `${Math.round(value / 1000)}k`;
    return `${Number((value / 1000000).toFixed(1))}M`;
  };
  const description = known
    ? `${fmt(tokens)} / ${fmt(contextWindow)} (${Math.round(percent)}%)`
    : t("composer.pendingUsage");
  return (
    <Popover
      label={t("composer.contextUsage")}
      width={260}
      trigger={({ open, id }) => (
        <Button
          size="compact"
          type="button"
          title={description}
          aria-label={`${t("composer.contextUsage")}: ${description}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          className="composer-control composer-context shrink-0 tabular-nums focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          style={{ color }}
        >
          <Gauge size={14} aria-hidden="true" />
          {known && (
            <span className="composer-context-detail select-text">
              {fmt(tokens)} / {fmt(contextWindow)}
            </span>
          )}
          <span className="select-text">
            {known ? `${Math.round(percent)}%` : "—"}
          </span>
        </Button>
      )}
    >
      {() => <ContextDetails contextUsage={contextUsage} />}
    </Popover>
  );
}

function ContextDetails({ contextUsage }: { contextUsage: ContextUsageInfo }) {
  const { t, i18n } = useTranslation();
  const { tokens, contextWindow, percent } = contextUsage;
  const format = new Intl.NumberFormat(i18n.resolvedLanguage ?? "zh-CN");
  const known = tokens != null && percent != null;
  return (
    <div className="p-3 text-[12px] text-[var(--label-secondary)]">
      <h2 className="mb-3 text-[13px] font-semibold text-[var(--label-primary)]">
        {t("composer.contextUsage")}
      </h2>
      <dl className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <dt>{t("composer.usedTokens")}</dt>
          <dd className="select-text tabular-nums text-[var(--label-primary)]">
            {known ? format.format(tokens) : t("composer.pendingUsage")}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt>{t("composer.contextWindow")}</dt>
          <dd className="select-text tabular-nums text-[var(--label-primary)]">
            {format.format(contextWindow)}
          </dd>
        </div>
      </dl>
      {known ? (
        <div
          className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--fill-secondary)]"
          role="progressbar"
          aria-label={t("composer.contextUsage")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(0, percent))}
        >
          <div
            className="h-full rounded-full bg-[var(--color-accent)]"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      ) : (
        <p className="mt-3 leading-[18px]">
          {t("composer.pendingUsageDescription")}
        </p>
      )}
    </div>
  );
}
