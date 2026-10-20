// 思考等级选择器与工具栏菜单共用选项

import { ChevronDown, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover } from "./Popover";
import type { ThinkingLevel } from "../../../../protocol/types";

const DEFAULT_THINKING_LEVELS: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
];

interface ThinkingSelectorProps {
  currentLevel: ThinkingLevel;
  availableLevels: ThinkingLevel[];
  onSelect?: (level: ThinkingLevel) => void;
}

export function ThinkingOptions({
  currentLevel,
  availableLevels,
  onSelect,
  onDone,
}: ThinkingSelectorProps & { onDone: () => void }) {
  const levels =
    availableLevels.length > 0 ? availableLevels : DEFAULT_THINKING_LEVELS;
  return (
    <div className="py-1.5 px-1.5">
      {levels.map((level) => {
        const active = level === currentLevel;
        return (
          <button
            type="button"
            key={level}
            aria-pressed={active}
            onClick={() => {
              if (!active) onSelect?.(level);
              onDone();
            }}
            className={`min-h-[44px] w-full text-left px-2.5 py-2 rounded-[8px] flex items-center gap-2 transition-colors select-none mb-0.5 ${active ? "bg-[var(--fill-secondary)]" : "hover:bg-[var(--fill-tertiary)]"}`}
          >
            <span className="flex-1 text-[13px] text-[var(--label-primary)]">
              {level}
            </span>
            {active && (
              <Check
                size={14}
                className="text-[var(--color-accent)] flex-shrink-0"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ThinkingSelector({
  currentLevel,
  availableLevels,
  onSelect,
}: ThinkingSelectorProps) {
  const { t } = useTranslation();
  const canSelect = !!onSelect;
  return (
    <Popover
      disabled={!canSelect}
      label={t("composer.thinkingLevel")}
      width={160}
      align="left"
      trigger={({ open, id }) => (
        <button
          type="button"
          disabled={!canSelect}
          aria-label={`${t("composer.thinkingLevel")}: ${currentLevel}`}
          aria-haspopup={canSelect ? "dialog" : undefined}
          aria-expanded={canSelect ? open : undefined}
          aria-controls={open ? id : undefined}
          className={`inline-flex min-h-9 items-center gap-1.5 px-2.5 py-1.5 rounded-[12px] text-[12px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] ${canSelect ? "hover:bg-[var(--fill-secondary)] cursor-pointer" : "cursor-default"} text-[var(--label-secondary)]`}
        >
          <span className="select-text">{currentLevel}</span>
          {canSelect && (
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={`transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            />
          )}
        </button>
      )}
    >
      {(close) => (
        <ThinkingOptions
          currentLevel={currentLevel}
          availableLevels={availableLevels}
          onSelect={onSelect}
          onDone={close}
        />
      )}
    </Popover>
  );
}
