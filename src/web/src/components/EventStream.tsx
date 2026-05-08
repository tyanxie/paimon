// 事件流面板：展示选中实例的实时事件

import { useRef, useEffect } from "react";
import type { InstanceId } from "../../../protocol/types";

interface EventStreamProps {
  events: Array<{
    instanceId: InstanceId;
    event: string;
    data: unknown;
    timestamp: number;
  }>;
  instanceId: InstanceId | null;
  onSendMessage: (message: string) => void;
  onAbort: () => void;
  instanceStatus?: "idle" | "streaming";
}

export function EventStream({
  events,
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

  if (!instanceId) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--label-tertiary)]">
        <div className="text-center">
          <div className="text-[22px] font-light mb-2">Paimon</div>
          <div className="text-[13px]">Select a pi instance to observe</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* 事件流 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {filteredEvents.length === 0 ? (
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
            className="flex-1 h-[var(--size-control-height)] px-3 rounded-[var(--radius-pill)] bg-[var(--fill-secondary)] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] outline-none focus:ring-1 focus:ring-[var(--color-accent)] text-[13px]"
          />
          <button
            type="submit"
            className="h-[var(--size-control-height)] px-4 rounded-[var(--radius-pill)] bg-[var(--color-accent)] text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            Send
          </button>
        </form>
        {instanceStatus === "streaming" && (
          <button
            onClick={onAbort}
            className="h-[var(--size-control-height)] px-4 rounded-[var(--radius-pill)] bg-red-500/80 text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            Abort
          </button>
        )}
      </div>
    </div>
  );
}

/** 单条事件渲染 */
function EventItem({
  event,
}: {
  event: { event: string; data: unknown; timestamp: number };
}) {
  const time = new Date(event.timestamp).toLocaleTimeString();

  // 根据事件类型显示不同样式
  const getEventColor = (eventName: string) => {
    if (eventName.includes("error")) return "text-red-400";
    if (eventName.includes("tool")) return "text-purple-400";
    if (eventName === "message_update") return "text-[var(--color-accent)]";
    return "text-[var(--label-secondary)]";
  };

  // 尝试提取可读内容
  const getContent = (data: unknown): string => {
    if (!data || typeof data !== "object") return JSON.stringify(data);
    const d = data as Record<string, unknown>;
    // message_update: 显示 content
    if (d.content && typeof d.content === "string") {
      return d.content.slice(0, 200);
    }
    // tool events: 显示 toolName
    if (d.toolName) {
      return `${d.toolName}${d.input ? ` → ${JSON.stringify(d.input).slice(0, 100)}` : ""}`;
    }
    return JSON.stringify(data).slice(0, 200);
  };

  return (
    <div className="group px-3 py-1.5 rounded-lg hover:bg-[var(--fill-tertiary)] transition-colors">
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
