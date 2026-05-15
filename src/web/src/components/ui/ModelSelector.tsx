// 模型选择器：点击弹出 Popover，按 provider 分组展示可选模型

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import type { ModelInfo } from "../../../../protocol/types";

interface ModelSelectorProps {
  currentModel: ModelInfo;
  availableModels?: ModelInfo[];
  onSelect?: (provider: string, id: string) => void;
}

interface ModelPopoverPositionInput {
  anchorRect: Pick<DOMRect, "top" | "right">;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
  viewportPadding?: number;
}

export function getModelPopoverPosition({
  anchorRect,
  viewportWidth,
  viewportHeight,
  margin = 8,
  viewportPadding = 12,
}: ModelPopoverPositionInput) {
  return {
    right: Math.max(viewportPadding, viewportWidth - anchorRect.right),
    bottom: Math.max(viewportPadding, viewportHeight - anchorRect.top + margin),
  };
}

export function ModelSelector({
  currentModel,
  availableModels,
  onSelect,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{
    right: number;
    bottom: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const hasModels = availableModels && availableModels.length > 0;
  const canSelect = hasModels && onSelect;

  // 按 provider 分组
  const groups = new Map<string, ModelInfo[]>();
  if (availableModels) {
    for (const m of availableModels) {
      const list = groups.get(m.provider) ?? [];
      list.push(m);
      groups.set(m.provider, list);
    }
  }

  const isCurrent = (m: ModelInfo) =>
    m.provider === currentModel.provider && m.id === currentModel.id;

  const togglePopover = () => {
    if (!canSelect) return;
    if (open) {
      setOpen(false);
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setPopoverPosition(
      getModelPopoverPosition({
        anchorRect: rect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );
    setOpen(true);
  };

  const popover =
    open && popoverPosition
      ? createPortal(
          <div
            ref={popoverRef}
            className="glass-popover z-50 w-[280px]"
            style={{
              position: "fixed",
              right: popoverPosition.right,
              bottom: popoverPosition.bottom,
            }}
          >
            <div className="max-h-[320px] overflow-y-auto py-1.5 scrollbar-auto">
              {Array.from(groups.entries()).map(([provider, models], gi) => (
                <div key={provider}>
                  {gi > 0 && (
                    <div className="mx-3 my-1 h-px bg-[var(--fill-tertiary)]" />
                  )}
                  <div className="px-3 pt-2 pb-1 text-[11px] font-bold text-[var(--label-tertiary)] uppercase select-none">
                    {provider}
                  </div>
                  {models.map((m) => {
                    const active = isCurrent(m);
                    return (
                      <button
                        key={`${m.provider}/${m.id}`}
                        onClick={() => {
                          if (!active) onSelect?.(m.provider, m.id);
                          setOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors select-none ${
                          active
                            ? "bg-[var(--fill-tertiary)]"
                            : "hover:bg-[var(--fill-quaternary)]"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-[var(--label-primary)] truncate select-text">
                            {m.name || m.id}
                          </div>
                          <div className="text-[11px] text-[var(--label-tertiary)] truncate select-text">
                            {m.id}
                          </div>
                        </div>
                        {active && (
                          <Check
                            size={14}
                            className="text-[var(--color-accent)] flex-shrink-0"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={togglePopover}
        className={`flex items-center gap-0.5 ${
          canSelect
            ? "hover:text-[var(--label-primary)] cursor-pointer"
            : "cursor-default"
        } transition-colors`}
      >
        {/* PC: provider/id, Mobile: name */}
        <span className="hidden md:inline select-text">
          {currentModel.provider}/{currentModel.id}
        </span>
        <span className="md:hidden select-text">
          {currentModel.name || currentModel.id}
        </span>
        {canSelect && (
          <ChevronDown
            size={10}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {/* Popover（向上弹出，portal 到 body 避免嵌套玻璃层） */}
      {popover}
    </div>
  );
}
