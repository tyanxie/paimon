import { Brain, ChevronRight, Loader2 } from "lucide-react";
import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { InstanceStatus } from "../../../../protocol/types";
import { Button } from "../../components/ui/Button";
import { Collapsible } from "../../components/ui/Collapsible";
import { ErrorCard } from "./ErrorCard";
import { MarkdownRenderer } from "./Markdown";
import { ReplyTime } from "./ReplyTime";
import { SystemEntry } from "./SystemEntry";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";
import { ToolStatusIndicator } from "./ToolStatus";
import { UserBubble } from "./UserBubble";
import {
  getSessionEntryRenderKey,
  type ConversationExecution,
  type ConversationItem,
  type ConversationReply,
  type SessionEntry,
  type SessionMessage,
} from "./types";

type ToolCounts = ConversationExecution["counts"];
type BeforeToggle = (element: HTMLElement) => void;

export function ConversationList({
  items,
  conversationKey,
  status,
  isStreaming,
  pendingUserEntry,
  isAwaitingReply = false,
  onReEdit,
  onBeforeToggle,
}: {
  items: ConversationItem[];
  conversationKey: string;
  status?: InstanceStatus;
  isStreaming: boolean;
  pendingUserEntry?: SessionEntry | null;
  isAwaitingReply?: boolean;
  onReEdit?: () => void;
  onBeforeToggle?: BeforeToggle;
}) {
  const busy =
    isAwaitingReply ||
    (status !== "compacting" && (status === "streaming" || isStreaming));
  const displayedItems: ConversationItem[] = pendingUserEntry
    ? [
        ...items,
        {
          type: "user",
          key: getSessionEntryRenderKey(pendingUserEntry),
          entry: pendingUserEntry,
        },
      ]
    : items;
  const last = displayedItems.at(-1);
  const pending: ConversationReply | null =
    busy && last?.type !== "reply"
      ? {
          type: "reply",
          key: `reply:${last?.key ?? "pending"}`,
          userEntryKey: displayedItems
            .slice()
            .reverse()
            .find((item) => item.type === "user")?.key,
          entries: [],
          parts: [],
        }
      : null;
  const visibleItems = pending ? [...displayedItems, pending] : displayedItems;
  const latestReplyKey = visibleItems
    .slice()
    .reverse()
    .find((item) => item.type === "reply")?.key;

  const replyTimes = getRoundReplyTimes(visibleItems);
  const runningRoundRef = useRef<{
    conversationKey: string;
    roundKey: string | undefined;
  } | null>(null);
  const latestReply = visibleItems
    .slice()
    .reverse()
    .find((item) => item.type === "reply");
  const latestRoundKey = latestReply?.userEntryKey ?? latestReply?.key;
  if (busy) {
    runningRoundRef.current = { conversationKey, roundKey: latestRoundKey };
  } else if (status !== "compacting") {
    runningRoundRef.current = null;
  }
  const runningReplyKey =
    runningRoundRef.current?.conversationKey === conversationKey &&
    runningRoundRef.current.roundKey !== undefined &&
    runningRoundRef.current.roundKey === latestRoundKey &&
    visibleItems.at(-1)?.type !== "user"
      ? latestReplyKey
      : undefined;

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
                  <SystemEntry
                    state={
                      item.state ?? { status: "completed", entry: item.entry }
                    }
                  />
                </div>
              );
            return (
              <ReplyCard
                key={item.key}
                reply={item}
                active={item.key === runningReplyKey}
                timestamps={replyTimes.get(item.key)}
                onReEdit={item.key === latestReplyKey ? onReEdit : undefined}
                onBeforeToggle={onBeforeToggle}
              />
            );
          })}
          {status === "compacting" &&
            !items.some(
              (item) =>
                item.type === "system" && item.state?.status === "compacting",
            ) && <SystemEntry state={{ status: "compacting" }} />}
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}

function getRoundTimestamps(
  messages: SessionMessage[],
): (string | undefined)[] {
  const first = messages[0];
  const last = messages.at(-1);
  const start = first?.timestamp;
  const endStart = last?.timestamp;
  const duration = last?.durationMs;
  const startTime =
    typeof start === "number" && Number.isFinite(new Date(start).getTime())
      ? new Date(start).toISOString()
      : undefined;
  const end =
    typeof endStart === "number" &&
    typeof duration === "number" &&
    duration >= 0
      ? endStart + duration
      : undefined;
  const endTime =
    startTime &&
    end !== undefined &&
    end >= Date.parse(startTime) &&
    Number.isFinite(new Date(end).getTime())
      ? new Date(end).toISOString()
      : undefined;
  return [startTime, endTime];
}

function getRoundReplyTimes(
  items: readonly ConversationItem[],
): ReadonlyMap<string, (string | undefined)[]> {
  const times = new Map<string, (string | undefined)[]>();
  let replies: ConversationReply[] = [];
  const finishRound = () => {
    const finalReply = replies.at(-1);
    if (!finalReply) return;
    const messages = replies.flatMap((reply) =>
      reply.entries.flatMap((entry) =>
        entry.message?.role === "assistant" ? [entry.message] : [],
      ),
    );
    times.set(finalReply.key, getRoundTimestamps(messages));
  };
  // 系统事件可以拆开回复卡片，计时仍覆盖同一条用户消息的完整轮次
  for (const item of items) {
    if (item.type === "user") {
      finishRound();
      replies = [];
    } else if (item.type === "reply") {
      replies.push(item);
    }
  }
  finishRound();
  return times;
}

function ReplyCard({
  reply,
  active,
  timestamps,
  onReEdit,
  onBeforeToggle,
}: {
  reply: ConversationReply;
  active: boolean;
  timestamps?: (string | undefined)[];
  onReEdit?: () => void;
  onBeforeToggle?: BeforeToggle;
}) {
  const { t } = useTranslation();
  const lastMessage = reply.entries
    .slice()
    .reverse()
    .find((entry) => entry.message?.role === "assistant")?.message;
  const stopped = lastMessage?.stopReason === "aborted";
  const failed = lastMessage?.stopReason === "error";
  const hasContent = reply.parts.some(
    (part) => part.type !== "execution" || part.items.length > 0,
  );

  const waiting = !hasContent && active;
  const showState = !active && (failed || stopped);
  if (!hasContent && !active && !failed && !stopped && !onReEdit) return null;

  return (
    <div
      className="conversation-reply-group space-y-1"
      data-entry-key={reply.key}
    >
      {(waiting || hasContent) && (
        <article
          className="conversation-reply rounded-surface border border-[var(--separator)] bg-[var(--fill-quaternary)] shadow-[0_2px_12px_rgba(0,0,0,0.035)]"
          data-reply-key={reply.key}
          aria-label={t("conversation.agentName")}
        >
          {waiting && (
            <div
              className="conversation-reply-pending flex items-center gap-2 px-4 py-3 text-[12px] leading-5 text-[var(--label-secondary)] md:px-5 md:py-4"
              role="status"
            >
              <Loader2
                size={14}
                aria-hidden="true"
                className="animate-spin motion-reduce:animate-none"
              />
              {t("conversation.waitingReply")}
            </div>
          )}
          {hasContent && (
            <div className="space-y-2 px-4 py-3 md:px-5 md:py-4">
              {reply.parts.map((part) => (
                <div
                  key={part.key}
                  data-entry-key={part.key}
                  className="conversation-part min-w-0"
                >
                  {part.type === "execution" ? (
                    <ExecutionSummary
                      execution={part}
                      onBeforeToggle={onBeforeToggle}
                    />
                  ) : part.type === "text" ? (
                    <MarkdownRenderer
                      content={part.content}
                      streaming={part.source.streaming}
                    />
                  ) : (
                    <ErrorCard message={part.content} />
                  )}
                </div>
              ))}
            </div>
          )}
        </article>
      )}
      <div className="conversation-reply-footer flex flex-wrap items-center gap-x-3 gap-y-1 px-1 md:px-2">
        <div className="conversation-reply-time flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-5 text-[var(--label-secondary)]">
          {timestamps && <ReplyTime timestamps={timestamps} running={active} />}
          {showState && (
            <span className="conversation-reply-state">
              {t(failed ? "conversation.replyFailed" : "entries.aborted")}
            </span>
          )}
        </div>
        {!waiting && onReEdit && (
          <Button
            size="compact"
            type="button"
            onClick={onReEdit}
            className="ml-auto shrink-0 px-2 text-[12px] text-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            {t("reEdit.button")}
          </Button>
        )}
      </div>
    </div>
  );
}

function ExecutionSummary({
  execution,
  onBeforeToggle,
}: {
  execution: ConversationExecution;
  onBeforeToggle?: BeforeToggle;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [visited, setVisited] = useState(false);
  const contentId = useId();
  const thinking = execution.items.filter((item) => item.type === "thinking");
  const thinkingStreaming = thinking.some((item) => item.source.streaming);
  const toolNames = useMemo(
    () => [
      ...new Set(
        execution.items.flatMap((item) =>
          item.type === "tool" ? [item.name] : [],
        ),
      ),
    ],
    [execution.items],
  );

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
        className="conversation-execution-toggle select-none flex w-full items-center gap-2 rounded-surface px-3 py-1 text-left focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-[var(--label-secondary)] transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`}
        />
        <span
          id={`${contentId}-summary`}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--label-secondary)]"
        >
          <span className="conversation-execution-counts inline-flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
            <ExecutionCounts counts={execution.counts} />
            {thinking.length > 0 && (
              <ThinkingIndicator
                count={thinking.length}
                streaming={thinkingStreaming}
              />
            )}
          </span>
          {toolNames.length > 0 && <ToolNames names={toolNames} />}
        </span>
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
                  presentation={item.presentation}
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

function ToolNames({ names }: { names: string[] }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLSpanElement>(null);
  const measurementRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(names.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measurement = measurementRef.current;
    if (!container || !measurement) return;
    let active = true;
    const measure = () => {
      if (!active) return;
      const available = container.getBoundingClientRect().width;
      if (available <= 0) return;
      const nameWidths = Array.from(
        measurement.querySelectorAll<HTMLElement>("[data-measure-name]"),
      ).map((element) => element.getBoundingClientRect().width);
      const overflowWidths = Array.from(
        measurement.querySelectorAll<HTMLElement>("[data-measure-overflow]"),
      ).map((element) => element.getBoundingClientRect().width);
      const gap = parseFloat(getComputedStyle(container).columnGap) || 0;
      let used = 0;
      let count = 0;
      for (const [index, width] of nameWidths.entries()) {
        used += width + (index > 0 ? gap : 0);
        const remaining = names.length - index - 1;
        const required =
          used +
          (remaining > 0 ? gap + (overflowWidths[remaining - 1] ?? 0) : 0);
        if (required <= available) count = index + 1;
      }
      setVisibleCount(count);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(measurement);
    document.fonts?.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [names]);

  const count = Math.min(visibleCount, names.length);
  const remaining = names.length - count;
  return (
    <span
      ref={containerRef}
      className="conversation-tool-names relative flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
    >
      {names.slice(0, count).map((name) => (
        <span
          key={name}
          data-tool-name={name}
          className="conversation-tool-name"
        >
          {name}
        </span>
      ))}
      {remaining > 0 && (
        <span
          className="conversation-tool-overflow shrink-0 text-[11px] tabular-nums"
          aria-label={t("conversation.moreToolTypes", { count: remaining })}
        >
          +{remaining}
        </span>
      )}
      <span
        ref={measurementRef}
        aria-hidden="true"
        className="conversation-tool-measure pointer-events-none invisible absolute left-0 top-0 flex w-max items-center gap-1"
      >
        {names.map((name) => (
          <span key={name} data-measure-name className="conversation-tool-name">
            {name}
          </span>
        ))}
        {names.map((_, index) => (
          <span
            key={index}
            data-measure-overflow
            className="shrink-0 text-[11px] tabular-nums"
          >
            +{index + 1}
          </span>
        ))}
      </span>
    </span>
  );
}

function ExecutionCounts({ counts }: { counts: ToolCounts }) {
  const statuses = [
    "pending",
    "running",
    "completed",
    "error",
    "aborted",
    "unknown",
  ] as const;
  return (
    <>
      {statuses.map((status) =>
        counts[status] > 0 ? (
          <ToolStatusIndicator
            key={status}
            status={status}
            count={counts[status]}
          />
        ) : null,
      )}
    </>
  );
}

function ThinkingIndicator({
  count,
  streaming,
}: {
  count: number;
  streaming: boolean;
}) {
  const { t } = useTranslation();
  const label = t(
    streaming
      ? "conversation.thinkingStreamingCount"
      : "conversation.thinkingCount",
    { count },
  );
  const Icon = streaming ? Loader2 : Brain;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-thinking-status={streaming ? "streaming" : "completed"}
      className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap tabular-nums text-[var(--label-secondary)]"
    >
      <Icon
        size={14}
        aria-hidden="true"
        className={
          streaming ? "animate-spin motion-reduce:animate-none" : undefined
        }
      />
      <span aria-hidden="true">{count}</span>
    </span>
  );
}
