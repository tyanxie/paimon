// 图片大图查看：全屏预览、可选原始尺寸与滚动阅读

import { useContext, useRef, useState, type ReactNode } from "react";
import {
  LazyMotion,
  MotionConfigContext,
  domAnimation,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import * as m from "motion/react-m";
import { cycleDialogFocus, useNativeDialog } from "./useNativeDialog";
import { createPortal } from "react-dom";
import { Button } from "./Button";
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

export function ImageLightbox(props: ImageLightboxProps) {
  return (
    <LazyMotion features={domAnimation} strict>
      <LightboxContent {...props} />
    </LazyMotion>
  );
}

function LightboxContent({
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
  const overlayRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const present = useIsPresent();
  const motionPolicy = useContext(MotionConfigContext).reducedMotion;
  const reducedMotion = useReducedMotion() || motionPolicy === "always";
  useNativeDialog(overlayRef, closeRef);
  function requestClose() {
    if (present) onClose();
  }

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
    <m.dialog
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={alt ?? t("imagePreview.title")}
      inert={!present}
      data-presence={present ? "present" : "exiting"}
      className="native-dialog-viewport image-lightbox fixed-viewport z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-[30px]"
      initial={{ opacity: reducedMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : 0.15 } }}
      transition={{ duration: reducedMotion ? 0 : 0.2 }}
      onClick={requestClose}
      onKeyDown={cycleDialogFocus}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }}
    >
      {/* 浮动工具栏与关闭按钮保持在滚动内容之外 */}
      {zoomable && (
        <Button
          size="compact"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            toggleSize();
          }}
          className="glass-panel absolute top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 text-[13px] text-[var(--label-primary)] select-none hover:text-[var(--color-accent)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        >
          {actualSize ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
          {actualSize
            ? t("imagePreview.fitWindow")
            : t("imagePreview.actualSize")}
        </Button>
      )}
      <Button
        size="icon"
        ref={closeRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          requestClose();
        }}
        className={`absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-10 flex items-center justify-center select-none transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${zoomable ? "glass-panel text-[var(--label-primary)] hover:text-[var(--color-accent)]" : "rounded-full bg-[var(--badge-bg)] hover:bg-[var(--badge-bg-hover)] text-[var(--badge-text)]"}`}
        aria-label={t("imagePreview.close")}
      >
        <X size={18} />
      </Button>

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
    </m.dialog>,
    document.body,
  );
}
