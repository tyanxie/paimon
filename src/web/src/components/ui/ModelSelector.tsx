// 模型选择器：点击弹出 Popover，按 provider 分组展示可选模型

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { ModelInfo } from "../../../../protocol/types";

interface ModelSelectorProps {
  currentModel: ModelInfo;
  availableModels?: ModelInfo[];
  onSelect?: (provider: string, id: string) => void;
}

export function ModelSelector({
  currentModel,
  availableModels,
  onSelect,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => canSelect && setOpen(!open)}
        className={`flex items-center gap-0.5 ${
          canSelect
            ? "hover:text-[var(--label-primary)] cursor-pointer"
            : "cursor-default"
        } transition-colors`}
      >
        {/* PC: provider/id, Mobile: name */}
        <span className="hidden md:inline">
          {currentModel.provider}/{currentModel.id}
        </span>
        <span className="md:hidden">
          {currentModel.name || currentModel.id}
        </span>
        {canSelect && (
          <ChevronDown
            size={10}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {/* Popover（向上弹出） */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-[280px] max-h-[320px] overflow-y-auto rounded-[14px] bg-[var(--material-thick)] backdrop-blur-[40px] border border-[var(--panel-border)] shadow-lg z-50 py-1.5 scrollbar-auto">
          {Array.from(groups.entries()).map(([provider, models], gi) => (
            <div key={provider}>
              {gi > 0 && (
                <div className="mx-3 my-1 h-px bg-[var(--fill-tertiary)]" />
              )}
              <div className="px-3 pt-2 pb-1 text-[11px] font-bold text-[var(--label-tertiary)] uppercase">
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
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                      active
                        ? "bg-[var(--fill-tertiary)]"
                        : "hover:bg-[var(--fill-quaternary)]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-[var(--label-primary)] truncate">
                        {m.name || m.id}
                      </div>
                      <div className="text-[11px] text-[var(--label-tertiary)] truncate">
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
      )}
    </div>
  );
}
