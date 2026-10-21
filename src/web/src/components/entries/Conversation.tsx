import { Button } from "../ui/Button";
import { useId, useState } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { Brain, ChevronRight, Loader2, Sparkles, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { InstanceStatus } from "../../../../protocol/types";
import {
  type ConversationExecution,
  type ConversationItem,
  type ConversationReply,
  type ConversationToolState,
  type SessionEntry,
} from "../../stores/types";
import { Collapsible } from "../ui/Collapsible";
import { ErrorCard, MetaEntry, UserBubble } from ".";
import { MarkdownRenderer } from "./Markdown";
import { MessageTime } from "./MessageTime";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";

type ToolCounts = ConversationExecution["counts"];
type BeforeToggle = (element: HTMLElement) => void;

export function ConversationList({
  items,
  entries,
  conversationKey,
  status,
  isStreaming,
  onReEdit,
  onBeforeToggle,
}: {
  items: ConversationItem[];
  entries: SessionEntry[];
  conversationKey: string;
  status?: InstanceStatus;
  isStreaming: boolean;
  onReEdit?: () => void;
  onBeforeToggle?: BeforeToggle;
}) {
  const busy = status === "streaming" || status === "compacting" || isStreaming;
  const last = items.at(-1);
  const pending: ConversationReply | null =
    busy && last?.type !== "reply"
      ? {
          type: "reply",
          key: `reply:${last?.type === "user" ? last.key : "pending"}`,
          userEntryKey: last?.type === "user" ? last.key : undefined,
          entries: [],
          parts: [],
        }
      : null;
  const visibleItems = pending ? [...items, pending] : items;
  const latestReplyKey = visibleItems
    .slice()
    .reverse()
    .find((item) => item.type === "reply")?.key;

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div key={conversationKey} className="conversation-list space-y-3">
          {visibleItems.map((item) => {
            if (item.type === "user")
              return (
                <div key={item.key} data-entry-key={item.key}>
                  <UserBubble
                    content={item.entry.message?.content}
                    timestamp={item.entry.timestamp}
                  />
                </div>
              );
            if (item.type === "system")
              return (
                <div key={item.key} data-entry-key={item.key}>
                  <MetaEntry
                    type={item.entry.type}
                    summary={item.entry.summary ?? ""}
                    timestamp={item.entry.timestamp}
                  />
                </div>
              );
            return (
              <ReplyCard
                key={item.key}
                reply={item}
                entries={entries}
                active={busy && item.key === latestReplyKey}
                compacting={
                  status === "compacting" && item.key === latestReplyKey
                }
                onReEdit={item.key === latestReplyKey ? onReEdit : undefined}
                onBeforeToggle={onBeforeToggle}
              />
            );
          })}
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}

function ReplyCard({
  reply,
  entries,
  active,
  compacting,
  onReEdit,
  onBeforeToggle,
}: {
  reply: ConversationReply;
  entries: SessionEntry[];
  active: boolean;
  compacting: boolean;
  onReEdit?: () => void;
  onBeforeToggle?: BeforeToggle;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  const groups = reply.parts.filter(
    (part): part is ConversationExecution => part.type === "execution",
  );
  const counts: ToolCounts = {
    running: 0,
    completed: 0,
    error: 0,
    aborted: 0,
    unknown: 0,
  };
  for (const group of groups) {
    for (const key of Object.keys(counts) as (keyof ToolCounts)[])
      counts[key] += group.counts[key];
  }
  const hasTools = Object.values(counts).some(Boolean);
  const activeGroup = groups.some(
    (group) =>
      group.counts.running > 0 ||
      group.items.some(
        (item) => item.type === "thinking" && item.source.streaming,
      ),
  );
  const error = reply.parts
    .slice()
    .reverse()
    .find((part) => part.type === "error");
  const lastMessage = reply.entries
    .slice()
    .reverse()
    .find((entry) => entry.message?.role === "assistant")?.message;
  const stopped = lastMessage?.stopReason === "aborted";
  const failed = lastMessage?.stopReason === "error";
  const preview = reply.parts.find((part) => part.type === "text");

  return (
    <article
      className="conversation-reply rounded-surface border border-[var(--separator)] bg-[var(--fill-quaternary)] shadow-[0_2px_12px_rgba(0,0,0,0.035)]"
      data-reply-key={reply.key}
    >
      <div
        data-entry-key={reply.key}
        className="group flex items-center gap-1 px-3 py-1.5 md:px-4"
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          aria-describedby={`${contentId}-summary`}
          aria-label={t(
            expanded
              ? "conversation.collapseReply"
              : "conversation.expandReply",
          )}
          onClick={(event) => {
            onBeforeToggle?.(event.currentTarget);
            setExpanded(!expanded);
          }}
          className="conversation-reply-toggle flex min-w-0 flex-1 items-center gap-2 rounded-control text-left focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control bg-[var(--fill-card)] text-[var(--label-secondary)]">
            <Sparkles size={15} aria-hidden="true" />
          </span>
          <span className="shrink-0 text-[14px] font-semibold text-[var(--label-primary)]">
            {t("conversation.agentName")}
          </span>
          <span
            id={`${contentId}-summary`}
            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--label-secondary)]"
          >
            {compacting ? (
              <RunningStatus compacting />
            ) : active && (!expanded || !activeGroup) ? (
              <RunningStatus />
            ) : null}
            {!active && (failed || stopped) && (
              <span>
                {t(failed ? "conversation.replyFailed" : "entries.aborted")}
              </span>
            )}
            {!expanded && hasTools && <ExecutionCounts counts={counts} />}
            {!expanded && !hasTools && !error && preview?.type === "text" && (
              <span className="truncate">
                {preview.content.replace(/\s+/g, " ").slice(0, 72)}
              </span>
            )}
          </span>
          <ChevronRight
            size={15}
            aria-hidden="true"
            className={`shrink-0 text-[var(--label-secondary)] transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
          />
        </button>
        {onReEdit && (
          <Button
            size="compact"
            type="button"
            onClick={onReEdit}
            className="shrink-0 px-2 py-1.5 text-[12px] text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            {t("reEdit.button")}
          </Button>
        )}
        <MessageTime
          timestamps={reply.entries.map((entry) => entry.timestamp)}
        />
      </div>
      <Collapsible id={contentId} expanded={expanded}>
        <div className="space-y-2 px-4 pb-3 md:px-5 md:pb-4">
          {reply.parts.map((part) => {
            const anchor = expanded ? part.key : undefined;
            if (part.type === "execution")
              return (
                <div key={part.key} data-entry-key={anchor}>
                  <ExecutionSummary
                    execution={part}
                    entries={entries}
                    onBeforeToggle={onBeforeToggle}
                  />
                </div>
              );
            if (part.type === "system")
              return (
                <div key={part.key} data-entry-key={anchor}>
                  <MetaEntry
                    type={part.entry.type}
                    summary={part.entry.summary ?? ""}
                    timestamp={part.entry.timestamp}
                  />
                </div>
              );
            return (
              <div
                key={part.key}
                data-entry-key={anchor}
                className="conversation-part group grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-1"
              >
                {part.type === "text" ? (
                  <MarkdownRenderer
                    content={part.content}
                    streaming={part.source.streaming}
                  />
                ) : (
                  <ErrorCard message={part.content} />
                )}
                <MessageTime timestamps={[part.source.entry.timestamp]} />
              </div>
            );
          })}
        </div>
      </Collapsible>
    </article>
  );
}

function ExecutionSummary({
  execution,
  entries,
  onBeforeToggle,
}: {
  execution: ConversationExecution;
  entries: SessionEntry[];
  onBeforeToggle?: BeforeToggle;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [visited, setVisited] = useState(false);
  const contentId = useId();
  const thinking = execution.items.filter((item) => item.type === "thinking");
  const thinkingStreaming = thinking.some((item) => item.source.streaming);
  const running = execution.counts.running > 0 || thinkingStreaming;
  const hasTools = Object.values(execution.counts).some(Boolean);
  const Icon = running ? Loader2 : hasTools ? Wrench : Brain;

  return (
    <section
      className="conversation-execution rounded-surface border border-[var(--separator)] bg-[var(--fill-quaternary)]"
      data-execution-key={execution.key}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        aria-describedby={`${contentId}-summary`}
        aria-label={t(
          expanded
            ? "conversation.collapseExecution"
            : "conversation.expandExecution",
        )}
        onClick={(event) => {
          onBeforeToggle?.(event.currentTarget);
          setVisited(true);
          setExpanded(!expanded);
        }}
        className="conversation-execution-toggle flex w-full items-center gap-2 rounded-surface px-3 py-1 text-left focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        <Icon
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-[var(--label-secondary)] ${running ? "animate-spin motion-reduce:animate-none" : ""}`}
        />
        <span
          id={`${contentId}-summary`}
          className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1 text-[12px] text-[var(--label-secondary)]"
        >
          <ExecutionCounts counts={execution.counts} />
          {thinking.length > 0 && (
            <span>
              {thinkingStreaming
                ? t("entries.thinkingStreaming")
                : t("conversation.thinkingCount", { count: thinking.length })}
            </span>
          )}
        </span>
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-[var(--label-secondary)] transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      <Collapsible id={contentId} expanded={expanded}>
        {visited && (
          <div className="space-y-1 border-t border-[var(--separator)] p-2">
            {execution.items.map((item) =>
              item.type === "thinking" ? (
                <ThinkingBlock
                  key={item.key}
                  content={item.content}
                  streaming={item.source.streaming}
                  onBeforeToggle={onBeforeToggle}
                />
              ) : (
                <ToolCallCard
                  key={item.key}
                  name={item.name}
                  args={item.args}
                  toolCallId={item.toolCallId}
                  entries={entries}
                  state={item.state}
                  execution={
                    item.state.status === "running"
                      ? item.state.execution
                      : undefined
                  }
                  compact
                />
              ),
            )}
          </div>
        )}
      </Collapsible>
    </section>
  );
}

function ExecutionCounts({ counts }: { counts: ToolCounts }) {
  const { t } = useTranslation();
  const keys: Record<ConversationToolState["status"], string> = {
    running: "conversation.toolsRunning",
    completed: "conversation.toolsCompleted",
    error: "conversation.toolsFailed",
    aborted: "conversation.toolsAborted",
    unknown: "conversation.toolsUnknown",
  };
  return (
    <>
      {(Object.keys(keys) as (keyof ToolCounts)[]).map(
        (status) =>
          counts[status] > 0 && (
            <span key={status} className="whitespace-nowrap">
              {t(keys[status], { count: counts[status] })}
            </span>
          ),
      )}
    </>
  );
}

function RunningStatus({ compacting = false }: { compacting?: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
    >
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-pulse motion-reduce:animate-none"
        aria-hidden="true"
      />
      {t(
        compacting
          ? "eventStream.statusCompacting"
          : "eventStream.statusRunning",
      )}
    </span>
  );
}
