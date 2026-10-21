import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Brain, ChevronRight } from "lucide-react";
import { MarkdownRenderer } from "./Markdown";
import { Collapsible } from "../ui/Collapsible";

export function ThinkingBlock({
  content,
  streaming,
  onBeforeToggle,
}: {
  content: string;
  streaming: boolean;
  onBeforeToggle?: (element: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [visited, setVisited] = useState(false);
  const contentId = useId();
  return (
    <div className="rounded-content bg-[var(--fill-quaternary)]">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={(event) => {
          onBeforeToggle?.(event.currentTarget);
          setVisited(true);
          setExpanded(!expanded);
        }}
        className="conversation-thinking-toggle flex w-full items-center gap-2 rounded-content px-3 text-left text-[12px] text-[var(--label-secondary)] hover:bg-[var(--fill-quaternary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        <Brain size={14} aria-hidden="true" />
        <span className="flex-1">
          {streaming ? t("entries.thinkingStreaming") : t("entries.thinking")}
        </span>
        <ChevronRight
          size={13}
          aria-hidden="true"
          className={`transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      <Collapsible id={contentId} expanded={expanded}>
        {visited && (
          <div className="px-3 pb-3 text-[var(--label-secondary)]">
            <MarkdownRenderer content={content} streaming={streaming} />
          </div>
        )}
      </Collapsible>
    </div>
  );
}
