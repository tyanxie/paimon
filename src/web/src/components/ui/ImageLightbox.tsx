// 图片大图查看 overlay 组件
// 点击图片后全屏展示，点击背景或按 Esc 关闭

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";

interface ImageLightboxProps {
  /** 图片 URL（data URL 或 http URL） */
  src: string;
  /** 替代文本 */
  alt?: string;
  /** 关闭回调 */
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  // Esc 键关闭
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    // 禁止背景滚动
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        aria-label="Close"
      >
        <X size={18} />
      </button>

      {/* 图片 */}
      <img
        src={src}
        alt={alt ?? "Image preview"}
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl select-none"
        draggable={false}
      />
    </div>
  );
}
