// 当前实例的历史、流式消息、工具执行与订阅生命周期。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  HubToBrowserMessage,
  InstanceId,
  InstanceInfo,
} from "../../../../protocol/types";
import { showToast } from "../../components/ui/Toast";
import { useWebSocket } from "../../stores/useWebSocket";
import { isRecord } from "../../utils/typeGuards";
import {
  isConversationToolEvent,
  isSessionEntry,
  isSessionMessage,
} from "./conversationData";
import type {
  ConversationItem,
  ConversationLoadState,
  SessionEntry,
  ToolExecutionState,
} from "./types";
import { useConversationDisplay } from "./useConversationDisplay";

// ── 返回值类型 ──

export interface ConversationState {
  entries: SessionEntry[];
  displayItems: ConversationItem[];
  toolExecutions: ReadonlyMap<string, ToolExecutionState>;
  streamingEntry: SessionEntry | null;
  isStreaming: boolean;
  loadState: ConversationLoadState;
  errorMessage: string | null;
  hasMore: boolean;
  loadMore: () => void;
}

// ── renderKey 生成 ──

let renderKeySeq = 0;

function nextRenderKey(instanceId: InstanceId, source: string): string {
  return `${instanceId}:${source}:${renderKeySeq++}`;
}

function ensureRenderKey(
  instanceId: InstanceId,
  entry: SessionEntry,
  source: string,
): SessionEntry {
  if (entry.id || entry.__renderKey) return entry;
  return { ...entry, __renderKey: nextRenderKey(instanceId, source) };
}

// ── Hook ──

const noop = () => {};

export function useConversation(
  instanceId: InstanceId,
  instance: InstanceInfo | undefined,
  onReset: () => void = noop,
): ConversationState {
  const { t } = useTranslation();
  const send = useWebSocket((s) => s.send);
  const subscribe = useWebSocket((s) => s.subscribe);
  const connected = useWebSocket((s) => s.connectionState === "connected");

  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [toolExecutions, setToolExecutions] = useState<
    Map<string, ToolExecutionState>
  >(new Map());
  const [liveToolCallIds, setLiveToolCallIds] = useState<Set<string>>(
    new Set(),
  );
  const [streamingEntry, setStreamingEntry] = useState<SessionEntry | null>(
    null,
  );
  // 追踪当前 streamingEntry 的 renderKey，避免闭包读取 state 过时
  const streamingKeyRef = useRef<string | null>(null);
  const streamingTimestampRef = useRef<string | null>(null);
  const [loadState, setLoadState] = useState<ConversationLoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // 用于 loadMore 获取当前 entries 长度（避免闭包陈旧）
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const loadStateRef = useRef(loadState);
  loadStateRef.current = loadState;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  // ── 重置对话状态 ──
  const resetConversation = useCallback(() => {
    setEntries([]);
    setToolExecutions(new Map());
    setLiveToolCallIds(new Set());
    streamingKeyRef.current = null;
    streamingTimestampRef.current = null;
    setStreamingEntry(null);
    setLoadState("refreshing");
    setErrorMessage(null);
    setHasMore(false);
    onReset();
  }, [onReset]);

  // ── WS 订阅：接收对话相关消息 ──
  useEffect(() => {
    return subscribe((msg: HubToBrowserMessage) => {
      switch (msg.type) {
        case "forwarded_event": {
          if (msg.payload.instanceId !== instanceId) return;
          handleStreamEvent(
            instanceId,
            msg.payload.event,
            msg.payload.data,
            msg.payload.timestamp,
          );
          break;
        }
        case "history": {
          if (msg.payload.instanceId !== instanceId) return;
          const messages: unknown = msg.payload.messages;
          if (!Array.isArray(messages) || !messages.every(isSessionEntry)) {
            console.error("[Paimon] Invalid conversation history");
            setLoadState("error");
            setErrorMessage(null);
            break;
          }
          const newHasMore = msg.payload.hasMore ?? false;
          applyHistory(instanceId, messages, newHasMore);
          break;
        }
        case "error": {
          console.error("[Paimon]", msg.payload.message);
          setLoadState("error");
          setErrorMessage(msg.payload.message);
          break;
        }
        case "instance_error": {
          if (msg.payload.instanceId !== instanceId) return;
          const actionKey = msg.payload.action
            ? `error.action.${msg.payload.action}`
            : null;
          const localizedMsg = actionKey
            ? t(actionKey, {
                message: msg.payload.message,
                defaultValue: msg.payload.message,
              })
            : msg.payload.message;
          showToast(localizedMsg, "error");
          break;
        }
      }
    });
  }, [instanceId, subscribe]);

  // ── 实例订阅生命周期：进入页面订阅，离开页面取消 ──
  useEffect(() => {
    if (!connected) return;

    resetConversation();
    send({ type: "subscribe", payload: { instanceId } });
    send({ type: "get_history", payload: { instanceId } });

    return () => {
      send({ type: "unsubscribe", payload: { instanceId } });
    };
  }, [instanceId, connected, send, resetConversation]);

  // ── 监听 sessionId 变化 → 重新拉取 history ──
  const prevSessionIdRef = useRef(instance?.sessionId);
  const prevInstanceIdRef = useRef(instanceId);
  useEffect(() => {
    const currentSessionId = instance?.sessionId;

    // 切换实例时 instanceId 也变了，不是同实例内 session 切换，跳过
    if (instanceId !== prevInstanceIdRef.current) {
      prevInstanceIdRef.current = instanceId;
      if (currentSessionId !== undefined) {
        prevSessionIdRef.current = currentSessionId;
      }
      return;
    }

    if (
      prevSessionIdRef.current !== undefined &&
      currentSessionId !== undefined &&
      currentSessionId !== prevSessionIdRef.current
    ) {
      // 同实例内 session 变了，重置并重新拉取
      resetConversation();
      send({ type: "get_history", payload: { instanceId } });
    }
    // 只在 sessionId 有效时更新 ref，避免中间态 undefined 覆盖有效值
    if (currentSessionId !== undefined) {
      prevSessionIdRef.current = currentSessionId;
    }
  }, [instance?.sessionId, instanceId, send, resetConversation]);

  // ── 监听 compacting → 非 compacting 转换 → 重新拉取 ──
  const prevStatusRef = useRef(instance?.status);
  useEffect(() => {
    const currentStatus = instance?.status;
    if (
      prevStatusRef.current === "compacting" &&
      currentStatus !== "compacting"
    ) {
      resetConversation();
      send({ type: "get_history", payload: { instanceId } });
    }
    prevStatusRef.current = currentStatus;
  }, [instance?.status, instanceId, send, resetConversation]);

  // 当前实时 assistant 消息中的工具调用保留准备阶段，直到收到执行事件。
  function rememberLiveToolCalls(message: SessionEntry["message"]) {
    if (message?.role !== "assistant") return;
    const blocks = Array.isArray(message.content) ? message.content : [];
    setLiveToolCallIds(
      new Set(
        blocks.flatMap((block: unknown) =>
          isRecord(block) &&
          block.type === "toolCall" &&
          typeof block.id === "string"
            ? [block.id]
            : [],
        ),
      ),
    );
  }

  // ── 处理 streaming 事件 ──
  function handleStreamEvent(
    id: InstanceId,
    event: string,
    data: unknown,
    timestamp: number,
  ) {
    if (!isRecord(data)) return;
    const d = data;
    const eventTime = new Date(timestamp).toISOString();

    switch (event) {
      case "tool_execution_start":
      case "tool_execution_update":
      case "tool_execution_end": {
        const tool = { ...d, type: event };
        if (!isConversationToolEvent(tool) || tool.parentToolCallId) break;
        const startedAt =
          tool.type === "tool_execution_start" ? performance.now() : undefined;
        setToolExecutions((prev) => {
          const current = prev.get(tool.toolCallId);
          // 结束后的状态保持稳定，迟到的更新不会重新显示执行中。
          if (
            current?.status === "completed" &&
            tool.type !== "tool_execution_end"
          )
            return prev;
          const next = new Map(prev);
          next.set(
            tool.toolCallId,
            tool.type === "tool_execution_end"
              ? {
                  status: "completed",
                  startedAt: current?.startedAt,
                  result: tool.result,
                  isError: tool.isError,
                  durationMs: tool.durationMs,
                }
              : {
                  status: "running",
                  startedAt:
                    tool.type === "tool_execution_start"
                      ? startedAt
                      : current?.startedAt,
                  partialResult:
                    tool.type === "tool_execution_update"
                      ? tool.partialResult
                      : current?.status === "running"
                        ? current.partialResult
                        : undefined,
                },
          );
          return next;
        });
        break;
      }
      case "message_start": {
        const message = d.message;
        if (!isSessionMessage(message) || message.role !== "assistant") break;
        rememberLiveToolCalls(message);
        const entry = ensureRenderKey(
          id,
          { type: "message", timestamp: eventTime, message },
          "streaming",
        );
        streamingKeyRef.current = entry.__renderKey ?? entry.id ?? null;
        streamingTimestampRef.current = eventTime;
        setStreamingEntry(entry);
        break;
      }
      case "message_update": {
        const message = d.message;
        if (!isSessionMessage(message)) break;
        rememberLiveToolCalls(message);
        const stableKey =
          streamingKeyRef.current ?? nextRenderKey(id, "streaming");
        streamingKeyRef.current = stableKey;
        const messageTime = streamingTimestampRef.current ?? eventTime;
        streamingTimestampRef.current = messageTime;
        setStreamingEntry((prev) => {
          if (prev) {
            return { ...prev, message };
          }
          // 刷新后场景：隐式创建 streaming entry
          return {
            type: "message",
            timestamp: messageTime,
            message,
            __renderKey: stableKey,
          };
        });
        break;
      }
      case "message_end": {
        const message = d.message;
        if (isSessionMessage(message)) {
          rememberLiveToolCalls(message);
          // 复用 streamingEntry 的 key，避免 React 重建组件导致弹窗状态丢失
          const stableKey =
            streamingKeyRef.current ?? nextRenderKey(id, "live");
          const entry: SessionEntry = {
            type: "message",
            timestamp: streamingTimestampRef.current ?? eventTime,
            message,
            __renderKey: stableKey,
          };
          setEntries((prev) => [...prev, entry]);
          if (
            message.role === "toolResult" &&
            typeof message.toolCallId === "string"
          ) {
            const toolCallId = message.toolCallId;
            setToolExecutions((prev) => {
              if (!prev.has(toolCallId)) return prev;
              const next = new Map(prev);
              next.delete(toolCallId);
              return next;
            });
          }
        }
        streamingKeyRef.current = null;
        streamingTimestampRef.current = null;
        setStreamingEntry(null);
        break;
      }
    }
  }

  // ── 应用 history 响应 ──
  function applyHistory(
    id: InstanceId,
    messages: SessionEntry[],
    newHasMore: boolean,
  ) {
    const normalized = messages.map((entry) =>
      ensureRenderKey(id, entry, "history"),
    );

    if (loadStateRef.current === "loadingMore") {
      // 追加到前面（加载更早历史）
      setEntries((prev) => [...normalized, ...prev]);
    } else {
      // 首次加载 / 刷新
      setEntries(normalized);
    }
    setToolExecutions((prev) => {
      const next = new Map(prev);
      for (const entry of messages) {
        if (
          entry.message?.role === "toolResult" &&
          typeof entry.message.toolCallId === "string"
        ) {
          next.delete(entry.message.toolCallId);
        }
      }
      return next;
    });
    setHasMore(newHasMore);
    setLoadState("idle");
    setErrorMessage(null);
  }

  // ── 加载更多历史 ──
  const loadMore = useCallback(() => {
    if (!hasMoreRef.current || loadStateRef.current !== "idle") return;
    const offset = entriesRef.current.length;
    setLoadState("loadingMore");
    send({ type: "get_history", payload: { instanceId, offset } });
  }, [instanceId, send]);

  const visibleEntries = useMemo(
    () => (streamingEntry ? [...entries, streamingEntry] : entries),
    [entries, streamingEntry],
  );
  const displayItems = useConversationDisplay(
    visibleEntries,
    toolExecutions,
    streamingEntry,
    instance?.status,
    liveToolCallIds,
  );

  return {
    entries: visibleEntries,
    displayItems,
    toolExecutions,
    streamingEntry,
    isStreaming: streamingEntry !== null,
    loadState,
    errorMessage,
    hasMore,
    loadMore,
  };
}
