// 模型选择器：点击弹出 Popover，按 provider 分组展示可选模型

import { ChevronDown, Check } from "lucide-react";
import { MenuItem } from "./MenuItem";
import { Popover } from "./Popover";
import type { ModelInfo } from "../../../../protocol/types";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
      label={t("composer.model")}
      disabled={!canSelect}
      width={280}
      align="left"
      trigger={({ open, id }) => (
        <button
          type="button"
          disabled={!canSelect}
          aria-label={`${t("composer.model")}: ${currentModel.name || currentModel.id}`}
          aria-haspopup={canSelect ? "dialog" : undefined}
          aria-expanded={canSelect ? open : undefined}
          aria-controls={open ? id : undefined}
          title={currentModel.name || currentModel.id}
          className={`inline-flex min-h-9 max-w-full items-center gap-1.5 px-2.5 py-1.5 rounded-[12px] text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${
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
              size={12}
              aria-hidden="true"
              className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            />
          )}
        </button>
      )}
    >
      {(close) => (
        <div
          className="ui-menu-scroll scrollbar-auto"
          style={{ maxHeight: "inherit" }}
        >
          {Array.from(groups.entries()).map(([provider, models], gi) => (
            <div key={provider}>
              {gi > 0 && (
                <div className="mx-1 my-1 h-px bg-[var(--separator)]" />
              )}
              <div className="ui-menu-section">{provider}</div>
              {models.map((m) => {
                const active = isCurrent(m);
                return (
                  <MenuItem
                    selected={active}
                    type="button"
                    key={`${m.provider}/${m.id}`}
                    aria-pressed={active}
                    onClick={() => {
                      if (!active) onSelect?.(m.provider, m.id);
                      close();
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-[var(--label-primary)] truncate select-text">
                        {m.name || m.id}
                      </div>
                      <div className="text-[12px] text-[var(--label-secondary)] truncate select-text">
                        {m.id}
                      </div>
                    </div>
                    {active && (
                      <Check
                        size={14}
                        className="text-[var(--color-accent)] flex-shrink-0"
                      />
                    )}
                  </MenuItem>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Popover>
  );
}
