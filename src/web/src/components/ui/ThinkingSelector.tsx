// 思考等级选择器：点击弹出 Popover，展示可选等级

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
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

interface ThinkingPopoverPositionInput {
  anchorRect: Pick<DOMRect, "top" | "right">;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
  viewportPadding?: number;
}

export function getThinkingPopoverPosition({
  anchorRect,
  viewportWidth,
  viewportHeight,
  margin = 8,
  viewportPadding = 12,
}: ThinkingPopoverPositionInput) {
  return {
    right: Math.max(viewportPadding, viewportWidth - anchorRect.right),
    bottom: Math.max(viewportPadding, viewportHeight - anchorRect.top + margin),
  };
}

export function ThinkingSelector({
  currentLevel,
  onSelect,
}: ThinkingSelectorProps) {
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

  const canSelect = !!onSelect;

  const togglePopover = () => {
    if (!canSelect) return;
    if (open) {
      setOpen(false);
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setPopoverPosition(
      getThinkingPopoverPosition({
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
            className="glass-popover z-50 w-[160px]"
            style={{
              position: "fixed",
              right: popoverPosition.right,
              bottom: popoverPosition.bottom,
            }}
          >
            <div className="py-1.5">
              {THINKING_LEVELS.map((level) => {
                const active = level === currentLevel;
                return (
                  <button
                    key={level}
                    onClick={() => {
                      if (!active) onSelect?.(level);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors select-none ${
                      active
                        ? "bg-[var(--fill-tertiary)]"
                        : "hover:bg-[var(--fill-quaternary)]"
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
        <span className="select-text">{currentLevel}</span>
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
