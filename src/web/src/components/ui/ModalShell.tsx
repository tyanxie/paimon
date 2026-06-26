import { X } from "lucide-react";

interface ModalShellProps {
  title: React.ReactNode;
  trailing?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}

/** 通用弹窗外壳：遮罩 + Liquid Glass 面板 + 标题栏 + 内容区 */
export function ModalShell({
  title,
  trailing,
  onClose,
  children,
}: ModalShellProps) {
  return (
    <div
      className="fixed-viewport z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[90%] max-w-[640px] max-h-[80vh] rounded-[18px] bg-[var(--material-modal)] backdrop-blur-[30px] border border-[var(--separator)] shadow-[0_8px_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--separator)]">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[var(--label-primary)] select-text">
            {title}
          </div>
          <div className="flex items-center gap-2 select-text">
            {trailing}
            <button
              onClick={onClose}
              className="select-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--fill-secondary)] transition-colors text-[var(--label-secondary)]"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* 内容区 */}
        {children}
      </div>
    </div>
  );
}
