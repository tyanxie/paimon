// 模型选择器：点击弹出 Popover，按 provider 分组展示可选模型

import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ModelInfo } from "../../../../protocol/types";
import { Button } from "../../components/ui/Button";
import { MenuItem } from "../../components/ui/MenuItem";
import { Popover } from "../../components/ui/Popover";
import { ModelBrandIcon } from "./ModelBrandIcon";

interface ModelSelectorProps {
  currentModel: ModelInfo;
  availableModels?: ModelInfo[];
  className?: string;
  onSelect?: (provider: string, id: string) => void;
}

export function ModelOptions({
  currentModel,
  availableModels,
  onSelect,
  onDone,
}: ModelSelectorProps & { onDone: () => void }) {
  const groups = new Map<string, ModelInfo[]>();
  for (const model of availableModels ?? []) {
    const group = groups.get(model.provider) ?? [];
    group.push(model);
    groups.set(model.provider, group);
  }
  return (
    <div
      className="ui-menu-scroll scrollbar-auto"
      style={{ maxHeight: "inherit" }}
    >
      {Array.from(groups.entries()).map(([provider, models], gi) => (
        <div key={provider}>
          {gi > 0 && <div className="mx-1 my-1 h-px bg-[var(--separator)]" />}
          <div className="ui-menu-section">{provider}</div>
          {models.map((model) => {
            const active =
              model.provider === currentModel.provider &&
              model.id === currentModel.id;
            return (
              <MenuItem
                selected={active}
                key={`${model.provider}/${model.id}`}
                aria-pressed={active}
                onClick={() => {
                  if (!active) onSelect?.(model.provider, model.id);
                  onDone();
                }}
              >
                <ModelBrandIcon model={model.id} size={18} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-[var(--label-primary)] truncate select-text">
                    {model.name || model.id}
                  </div>
                  <div className="text-[12px] text-[var(--label-secondary)] truncate select-text">
                    {model.id}
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
  );
}

export function ModelSelector({
  currentModel,
  availableModels,
  className = "",
  onSelect,
}: ModelSelectorProps) {
  const { t } = useTranslation();
  const hasModels = availableModels && availableModels.length > 0;
  const canSelect = hasModels && onSelect;

  return (
    <Popover
      label={t("composer.model")}
      disabled={!canSelect}
      width={280}
      align="left"
      trigger={({ open, id }) => (
        <Button
          size="compact"
          type="button"
          disabled={!canSelect}
          aria-label={`${t("composer.model")}: ${currentModel.name || currentModel.id}`}
          aria-haspopup={canSelect ? "dialog" : undefined}
          aria-expanded={canSelect ? open : undefined}
          aria-controls={open ? id : undefined}
          title={currentModel.name || currentModel.id}
          className={`inline-flex max-w-full items-center gap-1.5 px-2 text-[12px] font-normal disabled:opacity-100 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${
            canSelect
              ? "hover:bg-[var(--fill-secondary)] hover:text-[var(--label-primary)] cursor-pointer"
              : "cursor-default"
          } text-[var(--label-secondary)] ${className}`}
        >
          <ModelBrandIcon model={currentModel.id} />
          <span
            data-toolbar-label
            className="composer-model-name truncate select-text"
          >
            <span data-toolbar-label-content>
              {currentModel.name || currentModel.id}
            </span>
          </span>
          {canSelect && (
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={`selector-chevron shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            />
          )}
        </Button>
      )}
    >
      {(close) => (
        <ModelOptions
          currentModel={currentModel}
          availableModels={availableModels}
          onSelect={onSelect}
          onDone={close}
        />
      )}
    </Popover>
  );
}
