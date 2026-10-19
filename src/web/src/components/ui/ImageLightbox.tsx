// 图片大图查看：全屏预览、可选原始尺寸与滚动阅读

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ImageLightboxProps {
  /** 图片 URL（data URL 或 http URL），空字符串表示等待图片 */
  src: string;
  /** 替代文本 */
  alt?: string;
  /** 是否允许切换到原始尺寸 */
  zoomable?: boolean;
  /** 图片 URL 为空时展示的内容 */
  placeholder?: ReactNode;
  /** 关闭回调 */
  onClose: () => void;
}

export function ImageLightbox({
  src,
  alt,
  zoomable = false,
  placeholder,
  onClose,
}: ImageLightboxProps) {
  const { t } = useTranslation();
  const [actualSize, setActualSize] = useState(false);
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab") {
        const controls = overlayRef.current?.querySelectorAll<HTMLElement>(
          'button, [tabindex="0"]',
        );
        if (!controls?.length) return;
        const first = controls[0]!;
        const last = controls[controls.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function toggleSize() {
    setActualSize((value) => !value);
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0;
      viewportRef.current.scrollLeft = 0;
    }
  }

  const placeholderContent = (
    <div
      onClick={(event) => event.stopPropagation()}
      className="max-w-full max-h-full overflow-auto rounded-lg bg-[var(--btn-solid)] text-[var(--label-primary)] shadow-2xl"
    >
      {placeholder}
    </div>
  );

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt ?? t("imagePreview.title")}
      className="fixed-viewport z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[30px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* 浮动工具栏与关闭按钮保持在滚动内容之外 */}
      {zoomable && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleSize();
          }}
          className="glass-panel absolute top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-10 flex h-9 items-center gap-2 px-4 text-[13px] text-[var(--label-primary)] select-none hover:text-[var(--color-accent)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        >
          {actualSize ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
          {actualSize
            ? t("imagePreview.fitWindow")
            : t("imagePreview.actualSize")}
        </button>
      )}
      <button
        ref={closeRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={`absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10 flex h-9 w-9 items-center justify-center select-none transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${zoomable ? "glass-panel text-[var(--label-primary)] hover:text-[var(--color-accent)]" : "rounded-full bg-[var(--badge-bg)] hover:bg-[var(--badge-bg-hover)] text-[var(--badge-text)]"}`}
        aria-label={t("imagePreview.close")}
      >
        <X size={18} />
      </button>

      {zoomable ? (
        <div className="absolute left-[max(1rem,env(safe-area-inset-left))] right-[max(1rem,env(safe-area-inset-right))] top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] bottom-[max(1rem,env(safe-area-inset-bottom))]">
          <div
            ref={viewportRef}
            tabIndex={0}
            role="region"
            aria-label={t("imagePreview.title")}
            className="h-full w-full overflow-auto focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            <div
              className={`flex items-center justify-center ${actualSize ? "min-h-full min-w-full w-max" : "h-full w-full"}`}
            >
              {src ? (
                <img
                  src={src}
                  alt={alt ?? t("imagePreview.title")}
                  width={actualSize ? imageSize?.width : undefined}
                  height={actualSize ? imageSize?.height : undefined}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                      setImageSize({
                        width: image.naturalWidth,
                        height: image.naturalHeight,
                      });
                    }
                  }}
                  onClick={(event) => event.stopPropagation()}
                  className={`block shrink-0 rounded-lg bg-[var(--btn-solid)] shadow-2xl select-none ${actualSize ? "max-w-none max-h-none" : "max-w-full max-h-full object-contain"}`}
                  draggable={false}
                />
              ) : (
                // 保留图片占用的尺寸，浏览器会延续原有滚动范围和阅读位置
                <div
                  aria-hidden="true"
                  className="shrink-0"
                  style={actualSize && imageSize ? imageSize : undefined}
                />
              )}
            </div>
          </div>
          {!src && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="max-w-full max-h-full pointer-events-auto">
                {placeholderContent}
              </div>
            </div>
          )}
        </div>
      ) : src ? (
        <img
          src={src}
          alt={alt ?? t("imagePreview.title")}
          onClick={(event) => event.stopPropagation()}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl select-none"
          draggable={false}
        />
      ) : (
        placeholderContent
      )}
    </div>,
    document.body,
  );
}
