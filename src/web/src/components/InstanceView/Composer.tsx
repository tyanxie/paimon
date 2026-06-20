// 消息输入区：textarea + 图片上传/粘贴/预览 + 工具栏 + 状态指示 + 发送/停止

import { useRef, useLayoutEffect, useCallback, useState } from "react";
import { ArrowUp, Square, Minimize2, ImagePlus, X } from "lucide-react";
import type {
  InstanceInfo,
  ImagePayload,
  InstanceStatus,
  ContextUsageInfo,
  ThinkingLevel,
} from "../../../../protocol/types";
import type { InputDraft, InputDraftUpdater } from "../../stores/useDrafts";
import { isBusy } from "../../utils/status";
import { processImageFile, getImagesFromClipboard } from "../../utils/image";
import { showToast } from "../ui/Toast";
import { ModelSelector } from "../ui/ModelSelector";
import { ThinkingSelector } from "../ui/ThinkingSelector";
import { CompactModal } from "../ui/CompactModal";
import { useTranslation } from "react-i18next";

interface ComposerProps {
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

  const showContextInfo =
    !!contextUsage &&
    contextUsage.tokens != null &&
    contextUsage.percent != null;

  const resizeTextarea = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 150);
    el.style.height = `${newHeight}px`;
    el.style.overflowY = el.scrollHeight > 150 ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      resizeTextarea(textareaRef.current);
    }
  }, [draft.text, resizeTextarea]);

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
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    startBottomFollow();
  }, [instanceStatus, onSendMessage, startBottomFollow]);

  // 键盘事件：Enter 发送，Shift+Enter 换行，IME 组合输入中不触发
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
          showToast(t("eventStream.imageProcessFailed"));
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
          showToast(t("eventStream.imageProcessFailed"));
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
      <div className="glass-panel glass-panel-input px-3 py-2 md:px-4">
        {/* 信息行：状态 + 上下文 + 压缩按钮 */}
        {(instanceStatus || showContextInfo) && (
          <div className="mb-1.5 flex items-center gap-2 px-1 text-[12px] leading-[15px] text-[var(--label-secondary)]">
            <ComposerStatusIndicator status={instanceStatus} />
            {showContextInfo && (
              <span className="min-w-0 flex items-center gap-1">
                <span className="min-w-0 truncate">
                  <ContextIndicator contextUsage={contextUsage!} />
                </span>
                {showCompactButton && (
                  <button
                    onClick={() => setShowCompactModal(true)}
                    disabled={compactDisabled}
                    title={t("eventStream.compactContext")}
                    className="shrink-0 inline-flex items-center justify-center p-0.5 rounded-[4px] text-[var(--label-secondary)] hover:text-[var(--color-accent)] hover:bg-[var(--fill-tertiary)] transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Minimize2 size={12} />
                  </button>
                )}
              </span>
            )}
          </div>
        )}

        {/* 输入框区域 */}
        <div className="flex flex-col overflow-hidden rounded-[14px] border border-[var(--separator)]">
          {/* 图片预览条 */}
          {draft.images.length > 0 && (
            <div className="flex gap-2 px-3 pt-2 pb-0 overflow-x-auto scrollbar-none md:px-4">
              {draft.images.map((img) => (
                <div key={img.id} className="relative flex-shrink-0 group">
                  <button
                    onClick={() => onImageLightbox(img.previewUrl)}
                    className="block rounded-[8px] overflow-hidden border border-[var(--separator)] hover:border-[var(--color-accent)] transition-colors"
                  >
                    <img
                      src={img.previewUrl}
                      alt="Attached"
                      className="w-[60px] h-[60px] object-cover"
                      draggable={false}
                    />
                  </button>
                  <button
                    onClick={() => handleRemoveImage(img.id)}
                    className="absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full bg-[var(--badge-bg)] text-[var(--badge-text)] flex items-center justify-center hover:bg-[var(--badge-bg-hover)] transition-colors"
                    aria-label="Remove image"
                  >
                    <X size={8} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={t("eventStream.sendPlaceholder")}
            value={draft.text}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            className="resize-none bg-transparent text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] text-[16px] leading-[24px] px-3 pt-[9px] pb-0 outline-none overflow-hidden md:px-4 md:pt-[10px] md:text-[14px] md:leading-[22px]"
          />
          {/* 操作行：模型/thinking/上传 + 发送/停止 */}
          <div className="flex items-center justify-between px-1.5 pt-[9px] pb-1.5 md:pt-[10px]">
            <div className="flex items-center gap-1">
              {instanceModel && (
                <ModelSelector
                  currentModel={instanceModel}
                  availableModels={availableModels}
                  onSelect={onSetModel}
                />
              )}
              {thinkingLevel && (
                <ThinkingSelector
                  currentLevel={thinkingLevel}
                  onSelect={onSetThinkingLevel}
                />
              )}
              {/* 上传图片按钮 */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="select-none h-[26px] px-1.5 rounded-[6px] flex items-center justify-center text-[var(--label-secondary)] hover:text-[var(--label-primary)] hover:bg-[var(--fill-tertiary)] transition-colors"
                title={t("eventStream.attachImage")}
              >
                <ImagePlus size={15} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            <div className="flex-shrink-0">
              {buttonMode === "stop" ? (
                <button
                  onClick={onAbort}
                  className="select-none w-[28px] h-[28px] rounded-full bg-red-500 text-white flex items-center justify-center hover:opacity-90 active:opacity-80 transition-opacity"
                  title={t("eventStream.stop")}
                >
                  <Square size={12} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!canSend}
                  className={`select-none w-[28px] h-[28px] rounded-full flex items-center justify-center transition-opacity ${
                    canSend
                      ? "bg-[var(--color-accent)] text-white hover:opacity-90 active:opacity-80"
                      : "bg-[var(--fill-secondary)] text-[var(--label-tertiary)] opacity-50 cursor-default"
                  }`}
                  title={t("eventStream.send")}
                >
                  <ArrowUp size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 压缩上下文 Modal */}
      {showCompactModal && (
        <CompactModal
          onClose={() => setShowCompactModal(false)}
          onConfirm={(customInstructions) => {
            onCompact(customInstructions);
            setShowCompactModal(false);
          }}
        />
      )}
    </>
  );
}

// ─── 内部子组件 ──────────────────────────────────────────────────

export function ComposerStatusIndicator({
  status,
}: {
  status?: InstanceStatus;
}) {
  const { t } = useTranslation();
  if (!status) return null;

  const isRunning = status === "streaming";
  const isCompacting = status === "compacting";

  const colorClass = isRunning
    ? "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]"
    : isCompacting
      ? "bg-amber-500/10 text-amber-500"
      : "bg-green-500/10 text-green-500";

  const dotClass = isRunning
    ? "bg-[var(--color-accent)] animate-pulse"
    : isCompacting
      ? "bg-amber-500 animate-pulse"
      : "bg-green-500";

  const label = isRunning
    ? t("eventStream.statusRunning")
    : isCompacting
      ? t("eventStream.statusCompacting")
      : t("eventStream.statusOnline");

  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 ${colorClass}`}
      title={label}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </span>
  );
}

/** 上下文用量指示器 */
function ContextIndicator({
  contextUsage,
}: {
  contextUsage: ContextUsageInfo;
}) {
  const { tokens, contextWindow, percent } = contextUsage;
  if (tokens == null || percent == null) return null;

  const color = percent > 90 ? "#ff4245" : percent > 60 ? "#ff9230" : "#30d158";

  const fmt = (n: number) => {
    if (n < 1000) return String(n);
    if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
    if (n < 1000000) return `${Math.round(n / 1000)}k`;
    const m = n / 1000000;
    return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
  };

  return (
    <span className="select-text" style={{ color }}>
      {fmt(tokens)} / {fmt(contextWindow)} ({Math.round(percent)}%)
    </span>
  );
}
