// 模型选择器：点击弹出 Popover，按 provider 分组展示可选模型

import { ChevronDown, Check } from "lucide-react";
import { Popover } from "./Popover";
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
    <Popover
      disabled={!canSelect}
      width={280}
      align="left"
      trigger={({ open }) => (
        <button
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-[9px] bg-[var(--fill-tertiary)] text-[12px] transition-colors ${
            canSelect
              ? "hover:bg-[var(--fill-secondary)] hover:text-[var(--label-primary)] cursor-pointer"
              : "cursor-default"
          } text-[var(--label-secondary)]`}
        >
          <span className="max-w-[140px] truncate select-text">
            {currentModel.name || currentModel.id}
          </span>
          {canSelect && (
            <ChevronDown
              size={10}
              className={`transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </button>
      )}
    >
      {(close) => (
        <div className="max-h-[320px] overflow-y-auto py-1.5 px-1.5 scrollbar-auto">
          {Array.from(groups.entries()).map(([provider, models], gi) => (
            <div key={provider}>
              {gi > 0 && (
                <div className="mx-1 my-1 h-px bg-[var(--separator)]" />
              )}
              <div className="px-2.5 pt-2 pb-1 text-[11px] font-bold text-[var(--label-tertiary)] uppercase select-none">
                {provider}
              </div>
              {models.map((m) => {
                const active = isCurrent(m);
                return (
                  <button
                    key={`${m.provider}/${m.id}`}
                    onClick={() => {
                      if (!active) onSelect?.(m.provider, m.id);
                      close();
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-[8px] flex items-center gap-2 transition-colors select-none mb-0.5 ${
                      active
                        ? "bg-[var(--fill-secondary)]"
                        : "hover:bg-[var(--fill-tertiary)]"
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
      )}
    </Popover>
  );
}
