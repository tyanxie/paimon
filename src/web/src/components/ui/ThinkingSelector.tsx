// 思考等级选择器：点击弹出 Popover，展示可选等级

import { ChevronDown, Check } from "lucide-react";
import { Popover } from "./Popover";
import type { ThinkingLevel } from "../../../../protocol/types";

const THINKING_LEVELS: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
];

interface ThinkingSelectorProps {
  currentLevel: ThinkingLevel;
  onSelect?: (level: ThinkingLevel) => void;
}

export function ThinkingSelector({
  currentLevel,
  onSelect,
}: ThinkingSelectorProps) {
  const canSelect = !!onSelect;

  return (
    <Popover
      disabled={!canSelect}
      width={160}
      trigger={({ open }) => (
        <button
          className={`flex items-center gap-0.5 ${
            canSelect
              ? "hover:text-[var(--label-primary)] cursor-pointer"
              : "cursor-default"
          } transition-colors`}
        >
          <span className="select-text">{currentLevel}</span>
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
        <div className="py-1.5 px-1.5">
          {THINKING_LEVELS.map((level) => {
            const active = level === currentLevel;
            return (
              <button
                key={level}
                onClick={() => {
                  if (!active) onSelect?.(level);
                  close();
                }}
                className={`w-full text-left px-2.5 py-2 rounded-[8px] flex items-center gap-2 transition-colors select-none mb-0.5 ${
                  active
                    ? "bg-[var(--fill-secondary)]"
                    : "hover:bg-[var(--fill-tertiary)]"
                }`}
              >
                <span className="flex-1 text-[13px] text-[var(--label-primary)]">
                  {level}
                </span>
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
      )}
    </Popover>
  );
}
