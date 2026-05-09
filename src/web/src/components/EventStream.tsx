// 事件流面板：展示选中实例的实时事件（独立玻璃面板）

import { useRef, useEffect } from "react";
import type { InstanceId } from "../../../protocol/types";

interface EventStreamProps {
  events: Array<{
    instanceId: InstanceId;
    event: string;
    data: unknown;
    timestamp: number;
  }>;
  history: unknown[];
  instanceId: InstanceId | null;
  onSendMessage: (message: string) => void;
  onAbort: () => void;
  instanceStatus?: "idle" | "streaming";
}

export function EventStream({
  events,
  history,
  instanceId,
  onSendMessage,
  onAbort,
  instanceStatus,
}: EventStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 过滤当前实例事件
  const filteredEvents = instanceId
    ? events.filter((e) => e.instanceId === instanceId)
    : [];

  // 自动滚到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEvents.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || !input.value.trim()) return;
    onSendMessage(input.value.trim());
    input.value = "";
  };

  // 未选中实例：空状态（不带面板，直接浮在背景上）
  if (!instanceId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-[26px] font-light text-[var(--label-tertiary)] mb-2">
            Paimon
          </div>
          <div className="text-[13px] text-[var(--label-tertiary)]">
            Select a pi instance to observe
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="glass-panel flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* 事件流 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-thin"
      >
        {/* 历史消息 */}
        {history.length > 0 && (
          <>
            {history.map((entry, i) => (
              <HistoryItem key={`h-${i}`} entry={entry} />
            ))}
            {filteredEvents.length > 0 && (
              <div className="border-t border-[var(--separator)] my-2" />
            )}
          </>
        )}
        {/* 实时事件 */}
        {filteredEvents.length === 0 && history.length === 0 ? (
          <div className="text-center text-[var(--label-tertiary)] text-[12px] pt-8">
            Waiting for events...
          </div>
        ) : (
          filteredEvents.map((event, i) => <EventItem key={i} event={event} />)
        )}
      </div>

      {/* 输入栏 */}
      <div className="border-t border-[var(--separator)] p-3 flex gap-2">
        <form onSubmit={handleSubmit} className="flex-1 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Send a message..."
            className="flex-1 h-[36px] px-3 rounded-[1000px] bg-[var(--fill-secondary)] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] outline-none focus:ring-1 focus:ring-[var(--color-accent)] text-[13px] transition-shadow"
          />
          <button
            type="submit"
            className="h-[36px] px-4 rounded-[1000px] bg-[var(--color-accent)] text-white text-[13px] font-medium hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Send
          </button>
        </form>
        {instanceStatus === "streaming" && (
          <button
            onClick={onAbort}
            className="h-[36px] px-4 rounded-[1000px] bg-red-500/80 text-white text-[13px] font-medium hover:opacity-90 active:opacity-80 transition-opacity"
          >
            Abort
          </button>
        )}
      </div>
    </main>
  );
}

/** 单条事件渲染 */
function EventItem({
  event,
}: {
  event: { event: string; data: unknown; timestamp: number };
}) {
  const time = new Date(event.timestamp).toLocaleTimeString();

  const getEventColor = (eventName: string) => {
    if (eventName.includes("error")) return "text-red-400";
    if (eventName.includes("tool")) return "text-purple-400";
    if (eventName === "message_start") return "text-green-400";
    if (eventName === "message_update") return "text-[var(--color-accent)]";
    if (eventName === "message_end") return "text-emerald-400";
    if (eventName === "agent_start" || eventName === "agent_end")
      return "text-orange-400";
    if (eventName === "turn_start" || eventName === "turn_end")
      return "text-yellow-400";
    if (eventName.includes("session")) return "text-pink-400";
    return "text-[var(--label-secondary)]";
  };

  const getContent = (data: unknown): string => {
    if (!data || typeof data !== "object") return JSON.stringify(data);
    const d = data as Record<string, unknown>;
    if (d.content && typeof d.content === "string") {
      return d.content.slice(0, 200);
    }
    if (d.toolName) {
      return `${d.toolName}${d.input ? ` → ${JSON.stringify(d.input).slice(0, 100)}` : ""}`;
    }
    return JSON.stringify(data).slice(0, 200);
  };

  return (
    <div className="group px-3 py-1.5 rounded-[8px] hover:bg-[var(--fill-tertiary)] transition-colors">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] text-[var(--label-tertiary)] tabular-nums">
          {time}
        </span>
        <span
          className={`text-[11px] font-medium ${getEventColor(event.event)}`}
        >
          {event.event}
        </span>
      </div>
      <div className="text-[12px] text-[var(--label-secondary)] mt-0.5 break-all line-clamp-3">
        {getContent(event.data)}
      </div>
    </div>
  );
}

/** 历史 entry 渲染（session branch 条目） */
function HistoryItem({ entry }: { entry: unknown }) {
  if (!entry || typeof entry !== "object") return null;

  const e = entry as Record<string, unknown>;
  const message = e.message as Record<string, unknown> | undefined;
  if (!message) return null;

  const role = message.role as string;
  const timestamp = e.timestamp
    ? new Date(e.timestamp as string).toLocaleTimeString()
    : "";

  const getRoleColor = (r: string) => {
    if (r === "user") return "text-green-400";
    if (r === "assistant") return "text-[var(--color-accent)]";
    if (r === "toolResult") return "text-purple-400";
    return "text-[var(--label-secondary)]";
  };

  const getContent = (): string => {
    const content = message.content;
    if (typeof content === "string") return content.slice(0, 300);
    if (Array.isArray(content)) {
      // content blocks
      const texts = content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
      if (texts) return texts.slice(0, 300);
      // tool_use blocks
      const toolUse = content.find((b: any) => b.type === "tool_use");
      if (toolUse) return `tool: ${(toolUse as any).name}`;
      return JSON.stringify(content).slice(0, 200);
    }
    return JSON.stringify(content).slice(0, 200);
  };

  return (
    <div className="group px-3 py-1.5 rounded-[8px] hover:bg-[var(--fill-tertiary)] transition-colors">
      <div className="flex items-baseline gap-2">
        <span className="text-[10px] text-[var(--label-tertiary)] tabular-nums">
          {timestamp}
        </span>
        <span className={`text-[11px] font-medium ${getRoleColor(role)}`}>
          {role}
        </span>
      </div>
      <div className="text-[12px] text-[var(--label-secondary)] mt-0.5 break-all line-clamp-3">
        {getContent()}
      </div>
    </div>
  );
}
