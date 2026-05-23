// 全局状态管理

import { useState, useCallback, useRef } from "react";
import type {
  InstanceInfo,
  HubToBrowserMessage,
  InstanceId,
} from "../../../protocol/types";

/** 统一的 session entry（来自 getBranch 或实时事件构造） */
export interface SessionEntry {
  type: string;
  id?: string;
  /** 前端内部使用的稳定渲染 key，不参与协议传输 */
  __renderKey?: string;
  parentId?: string;
  timestamp?: string;
  message?: {
    role: string;
    content: unknown;
    [key: string]: unknown;
  };
  summary?: string;
  [key: string]: unknown;
}

type RenderKeySource = "history" | "streaming" | "live";

export type ConversationLoadState =
  | "idle"
  | "refreshing"
  | "loadingMore"
  | "error";

export interface ConversationState {
  currentInstanceId: InstanceId | null;
  entries: SessionEntry[];
  streamingEntry: SessionEntry | null;
  hasMore: boolean;
  loadState: ConversationLoadState;
  errorMessage: string | null;
  shouldScrollToBottom: boolean;
  drafts: Map<InstanceId, string>;
}

type NextRenderKey = (
  instanceId: InstanceId,
  source: RenderKeySource,
) => string;

export function getSessionEntryRenderKey(entry: SessionEntry): string {
  const key = entry.id ?? entry.__renderKey;
  if (!key) {
    throw new Error(
      `SessionEntry missing stable render key: type=${entry.type}`,
    );
  }
  return key;
}

function ensureRenderKey(
  instanceId: InstanceId,
  entry: SessionEntry,
  source: RenderKeySource,
  nextRenderKey: NextRenderKey,
): SessionEntry {
  if (entry.id || entry.__renderKey) return entry;
  return { ...entry, __renderKey: nextRenderKey(instanceId, source) };
}

export function normalizeSessionEntriesForRender(
  instanceId: InstanceId,
  entries: SessionEntry[],
  source: RenderKeySource,
  nextRenderKey: NextRenderKey,
) {
  return entries.map((entry) =>
    ensureRenderKey(instanceId, entry, source, nextRenderKey),
  );
}

export function createSessionMessageEntry(
  instanceId: InstanceId,
  message: SessionEntry["message"],
  source: Exclude<RenderKeySource, "history">,
  nextRenderKey: NextRenderKey,
): SessionEntry {
  return ensureRenderKey(
    instanceId,
    {
      type: "message",
      timestamp: new Date().toISOString(),
      message,
    },
    source,
    nextRenderKey,
  );
}

export function createConversationState(): ConversationState {
  return {
    currentInstanceId: null,
    entries: [],
    streamingEntry: null,
    hasMore: false,
    loadState: "idle",
    errorMessage: null,
    shouldScrollToBottom: false,
    drafts: new Map(),
  };
}

export function getInstanceDraft(
  drafts: Map<InstanceId, string>,
  instanceId: InstanceId | null,
): string {
  if (!instanceId) return "";
  return drafts.get(instanceId) ?? "";
}

export function setInstanceDraft(
  drafts: Map<InstanceId, string>,
  instanceId: InstanceId,
  value: string,
): Map<InstanceId, string> {
  const next = new Map(drafts);
  if (value) {
    next.set(instanceId, value);
  } else {
    next.delete(instanceId);
  }
  return next;
}

export function beginInstanceRefresh(
  state: ConversationState,
  instanceId: InstanceId,
): ConversationState {
  return {
    ...state,
    currentInstanceId: instanceId,
    entries: [],
    streamingEntry: null,
    hasMore: false,
    loadState: "refreshing",
    errorMessage: null,
    shouldScrollToBottom: false,
  };
}

export function beginLoadMore(state: ConversationState): ConversationState {
  if (
    !state.currentInstanceId ||
    !state.hasMore ||
    state.loadState !== "idle"
  ) {
    return state;
  }

  return {
    ...state,
    loadState: "loadingMore",
    errorMessage: null,
    shouldScrollToBottom: false,
  };
}

export function applyHistoryResponse(
  state: ConversationState,
  instanceId: InstanceId,
  messages: SessionEntry[],
  hasMore: boolean,
): ConversationState {
  if (state.currentInstanceId !== instanceId) return state;

  if (state.loadState === "loadingMore") {
    return {
      ...state,
      entries: [...messages, ...state.entries],
      hasMore,
      loadState: "idle",
      errorMessage: null,
      shouldScrollToBottom: false,
    };
  }

  return {
    ...state,
    entries: messages,
    hasMore,
    loadState: "idle",
    errorMessage: null,
    shouldScrollToBottom: true,
  };
}

export function applyConversationError(
  state: ConversationState,
  message: string,
): ConversationState {
  return {
    ...state,
    loadState: "error",
    errorMessage: message,
    shouldScrollToBottom: false,
  };
}

export function useAppState() {
  const renderKeySeqRef = useRef(0);
  const nextRenderKey = useCallback<NextRenderKey>((instanceId, source) => {
    return `${instanceId}:${source}:${renderKeySeqRef.current++}`;
  }, []);

  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [conversation, setConversation] = useState<ConversationState>(() =>
    createConversationState(),
  );

  // 跟踪每个实例的 sessionId，用于检测变化
  const sessionIdMapRef = useRef<Map<InstanceId, string | undefined>>(
    new Map(),
  );
  // 当前查看的实例 sessionId 变化时设置为该 instanceId，App 层监听并重新拉取 history
  const [sessionChangedInstanceId, setSessionChangedInstanceId] =
    useState<InstanceId | null>(null);

  const clearSessionChanged = useCallback(() => {
    setSessionChangedInstanceId(null);
  }, []);

  const startInstanceRefresh = useCallback((instanceId: InstanceId) => {
    setConversation((prev) => beginInstanceRefresh(prev, instanceId));
  }, []);

  const startLoadMore = useCallback(() => {
    setConversation((prev) => beginLoadMore(prev));
  }, []);

  const setDraft = useCallback((instanceId: InstanceId, value: string) => {
    setConversation((prev) => ({
      ...prev,
      drafts: setInstanceDraft(prev.drafts, instanceId, value),
    }));
  }, []);

  const clearScrollToBottom = useCallback(() => {
    setConversation((prev) => {
      if (!prev.shouldScrollToBottom) return prev;
      return { ...prev, shouldScrollToBottom: false };
    });
  }, []);

  // handleForwardedEvent 只依赖稳定的 setConversation 与 nextRenderKey；如果后续加入非稳定依赖，需要同步更新这里的 deps。
  const handleMessage = useCallback(
    (msg: HubToBrowserMessage) => {
      switch (msg.type) {
        case "instance_list":
          setInstances(msg.payload.instances);
          // 初始化 sessionId 跟踪
          for (const inst of msg.payload.instances) {
            sessionIdMapRef.current.set(inst.id, inst.sessionId);
          }
          break;
        case "instance_update":
          if (msg.payload.action === "connected") {
            setInstances((prev) => {
              if (prev.some((i) => i.id === msg.payload.instance.id)) {
                return prev.map((i) =>
                  i.id === msg.payload.instance.id ? msg.payload.instance : i,
                );
              }
              return [...prev, msg.payload.instance];
            });
            // 记录新实例的 sessionId
            sessionIdMapRef.current.set(
              msg.payload.instance.id,
              msg.payload.instance.sessionId,
            );
          } else if (msg.payload.action === "disconnected") {
            setInstances((prev) =>
              prev.filter((i) => i.id !== msg.payload.instance.id),
            );
            sessionIdMapRef.current.delete(msg.payload.instance.id);
          } else if (msg.payload.action === "updated") {
            const inst = msg.payload.instance;
            const prevSessionId = sessionIdMapRef.current.get(inst.id);
            // 只在 sessionId 有效时更新 map，避免 ctx 未就绪时 undefined 覆盖有效值
            if (inst.sessionId !== undefined) {
              sessionIdMapRef.current.set(inst.id, inst.sessionId);
            }

            setInstances((prev) =>
              prev.map((i) => (i.id === inst.id ? inst : i)),
            );

            // sessionId 变化且是当前查看的实例 → 通知 App 层重新拉取 history
            // 只有新旧值都是有效值且不相等时才触发，避免 ctx 未就绪时 undefined 导致误触发
            if (
              prevSessionId !== undefined &&
              inst.sessionId !== undefined &&
              inst.sessionId !== prevSessionId
            ) {
              setConversation((prev) => {
                if (prev.currentInstanceId !== inst.id) return prev;
                return {
                  ...prev,
                  entries: [],
                  streamingEntry: null,
                  hasMore: false,
                  loadState: "refreshing",
                  errorMessage: null,
                  shouldScrollToBottom: false,
                };
              });
              setSessionChangedInstanceId(inst.id);
            }
          }
          break;
        case "forwarded_event":
          handleForwardedEvent(
            msg.payload.instanceId,
            msg.payload.event,
            msg.payload.data,
          );
          break;
        case "history": {
          const instanceId = msg.payload.instanceId;
          const newEntries = normalizeSessionEntriesForRender(
            instanceId,
            msg.payload.messages as SessionEntry[],
            "history",
            nextRenderKey,
          );
          const more = (msg.payload as any).hasMore ?? false;

          setConversation((prev) =>
            applyHistoryResponse(prev, instanceId, newEntries, more),
          );
          break;
        }
        case "error":
          console.error("[Paimon]", msg.payload.message);
          setConversation((prev) =>
            applyConversationError(prev, msg.payload.message),
          );
          break;
      }
    },
    [nextRenderKey],
  );

  /** 处理实时事件 */
  function handleForwardedEvent(
    instanceId: InstanceId,
    event: string,
    data: unknown,
  ) {
    const d = data as Record<string, unknown>;

    switch (event) {
      case "message_start": {
        const message = d.message as SessionEntry["message"];
        if (!message || message.role !== "assistant") break;

        // assistant 消息进入 streaming 阶段
        setConversation((prev) => {
          if (prev.currentInstanceId !== instanceId) return prev;
          return {
            ...prev,
            streamingEntry: createSessionMessageEntry(
              instanceId,
              message,
              "streaming",
              nextRenderKey,
            ),
          };
        });
        break;
      }
      case "message_update": {
        const message = d.message as SessionEntry["message"];
        if (!message) break;

        setConversation((prev) => {
          if (prev.currentInstanceId !== instanceId) return prev;
          if (prev.streamingEntry) {
            return {
              ...prev,
              streamingEntry: { ...prev.streamingEntry, message },
            };
          }

          // 刷新后场景：隐式创建 streaming entry
          return {
            ...prev,
            streamingEntry: createSessionMessageEntry(
              instanceId,
              message,
              "streaming",
              nextRenderKey,
            ),
          };
        });
        break;
      }
      case "message_end": {
        const message = d.message as SessionEntry["message"];

        setConversation((prev) => {
          if (prev.currentInstanceId !== instanceId) return prev;
          const nextEntries = message
            ? [
                ...prev.entries,
                createSessionMessageEntry(
                  instanceId,
                  message,
                  "live",
                  nextRenderKey,
                ),
              ]
            : prev.entries;

          return {
            ...prev,
            streamingEntry: null,
            entries: nextEntries,
          };
        });
        break;
      }
    }
  }

  return {
    instances,
    entries: conversation.entries,
    streamingEntry: conversation.streamingEntry,
    hasMore: conversation.hasMore,
    loadState: conversation.loadState,
    errorMessage: conversation.errorMessage,
    currentInstanceId: conversation.currentInstanceId,
    shouldScrollToBottom: conversation.shouldScrollToBottom,
    draft: getInstanceDraft(
      conversation.drafts,
      conversation.currentInstanceId,
    ),
    drafts: conversation.drafts,
    sessionChangedInstanceId,
    handleMessage,
    startInstanceRefresh,
    startLoadMore,
    setDraft,
    clearScrollToBottom,
    clearSessionChanged,
  };
}
