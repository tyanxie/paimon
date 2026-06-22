// InstanceView 私有 hook：管理当前实例的对话状态 + WS 订阅生命周期
//
// 职责：
// 1. 订阅/取消订阅实例的 WS 消息流
// 2. 处理 forwarded_event → 维护 entries + streamingEntry 状态机
// 3. 处理 history 响应 → 填充/追加消息列表
// 4. 处理 session_list 响应 → 维护 session 列表
// 5. 检测 instance.sessionId / status 变化 → 自动 re-fetch
// 6. 暴露 loadMore() 加载更多历史

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  InstanceId,
  InstanceInfo,
  HubToBrowserMessage,
  SessionListItem,
} from "../../../../protocol/types";
import { useWebSocket } from "../../stores/useWebSocket";
import type { SessionEntry, ConversationLoadState } from "../../stores/types";

// ── 返回值类型 ──

export interface ConversationState {
  entries: SessionEntry[];
  streamingEntry: SessionEntry | null;
  isStreaming: boolean;
  loadState: ConversationLoadState;
  errorMessage: string | null;
  hasMore: boolean;
  sessionList: SessionListItem[];
  sessionListLoading: boolean;
  loadMore: () => void;
  /** 请求 session 列表（内部管理 loading 状态） */
  requestSessionList: () => void;
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

export function useConversation(
  instanceId: InstanceId,
  instance: InstanceInfo | undefined,
): ConversationState {
  const send = useWebSocket((s) => s.send);
  const subscribe = useWebSocket((s) => s.subscribe);
  const connected = useWebSocket((s) => s.connectionState === "connected");

  const [entries, setEntries] = useState<SessionEntry[]>([]);
  const [streamingEntry, setStreamingEntry] = useState<SessionEntry | null>(
    null,
  );
  const [loadState, setLoadState] = useState<ConversationLoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [sessionList, setSessionList] = useState<SessionListItem[]>([]);
  const [sessionListLoading, setSessionListLoading] = useState(false);

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
    setStreamingEntry(null);
    setLoadState("refreshing");
    setErrorMessage(null);
    setHasMore(false);
    setSessionList([]);
    setSessionListLoading(false);
  }, []);

  // ── WS 订阅：接收对话相关消息 ──
  useEffect(() => {
    return subscribe((msg: HubToBrowserMessage) => {
      switch (msg.type) {
        case "forwarded_event": {
          if (msg.payload.instanceId !== instanceId) return;
          handleStreamEvent(instanceId, msg.payload.event, msg.payload.data);
          break;
        }
        case "history": {
          if (msg.payload.instanceId !== instanceId) return;
          const messages = msg.payload.messages as SessionEntry[];
          const newHasMore = msg.payload.hasMore ?? false;
          applyHistory(instanceId, messages, newHasMore);
          break;
        }
        case "session_list": {
          if (msg.payload.instanceId !== instanceId) return;
          setSessionList(msg.payload.sessions);
          setSessionListLoading(false);
          break;
        }
        case "error": {
          console.error("[Paimon]", msg.payload.message);
          setLoadState("error");
          setErrorMessage(msg.payload.message);
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

  // ── 处理 streaming 事件 ──
  function handleStreamEvent(id: InstanceId, event: string, data: unknown) {
    const d = data as Record<string, unknown>;

    switch (event) {
      case "message_start": {
        const message = d.message as SessionEntry["message"];
        if (!message || message.role !== "assistant") break;
        setStreamingEntry(
          ensureRenderKey(
            id,
            { type: "message", timestamp: new Date().toISOString(), message },
            "streaming",
          ),
        );
        break;
      }
      case "message_update": {
        const message = d.message as SessionEntry["message"];
        if (!message) break;
        setStreamingEntry((prev) => {
          if (prev) {
            return { ...prev, message };
          }
          // 刷新后场景：隐式创建 streaming entry
          return ensureRenderKey(
            id,
            { type: "message", timestamp: new Date().toISOString(), message },
            "streaming",
          );
        });
        break;
      }
      case "message_end": {
        const message = d.message as SessionEntry["message"];
        if (message) {
          const entry = ensureRenderKey(
            id,
            { type: "message", timestamp: new Date().toISOString(), message },
            "live",
          );
          setEntries((prev) => [...prev, entry]);
        }
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

  // ── 请求 session 列表 ──
  const requestSessionList = useCallback(() => {
    setSessionListLoading(true);
    send({ type: "list_sessions", payload: { instanceId } });
  }, [instanceId, send]);

  return {
    entries: streamingEntry ? [...entries, streamingEntry] : entries,
    streamingEntry,
    isStreaming: streamingEntry !== null,
    loadState,
    errorMessage,
    hasMore,
    sessionList,
    sessionListLoading,
    loadMore,
    requestSessionList,
  };
}
