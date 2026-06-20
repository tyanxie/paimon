// 对话状态管理

import { useState, useCallback, useRef } from "react";
import type { InstanceId, SessionListItem } from "../../../protocol/types";
import type {
  SessionEntry,
  InputDraft,
  InputDraftUpdater,
  ConversationLoadState,
} from "./types";
import { EMPTY_DRAFT } from "./types";

// ── 内部类型 ──

type RenderKeySource = "history" | "streaming" | "live";

type NextRenderKey = (
  instanceId: InstanceId,
  source: RenderKeySource,
) => string;

// ── 对话状态结构 ──

export interface ConversationState {
  currentInstanceId: InstanceId | null;
  entries: SessionEntry[];
  streamingEntry: SessionEntry | null;
  hasMore: boolean;
  loadState: ConversationLoadState;
  errorMessage: string | null;
  shouldScrollToBottom: boolean;
  drafts: Map<InstanceId, InputDraft>;
  sessionList: SessionListItem[];
  sessionListLoading: boolean;
}

// ── 纯状态转换函数 ──

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
    sessionList: [],
    sessionListLoading: false,
  };
}

export function getInstanceDraft(
  drafts: Map<InstanceId, InputDraft>,
  instanceId: InstanceId | null,
): InputDraft {
  if (!instanceId) return EMPTY_DRAFT;
  return drafts.get(instanceId) ?? EMPTY_DRAFT;
}

export function setInstanceDraft(
  drafts: Map<InstanceId, InputDraft>,
  instanceId: InstanceId,
  value: InputDraft,
): Map<InstanceId, InputDraft> {
  const next = new Map(drafts);
  if (value.text || value.images.length > 0) {
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
    sessionList: [],
    sessionListLoading: false,
  };
}

/** 重置当前实例的对话内容并进入刷新态（session 切换 / compaction） */
export function beginContentRefresh(
  state: ConversationState,
  instanceId: InstanceId,
  options?: { scrollToBottom?: boolean },
): ConversationState {
  if (state.currentInstanceId !== instanceId) return state;
  return {
    ...state,
    entries: [],
    streamingEntry: null,
    hasMore: false,
    loadState: "refreshing",
    errorMessage: null,
    shouldScrollToBottom: options?.scrollToBottom ?? false,
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

// ── 内部工具函数 ──

function ensureRenderKey(
  instanceId: InstanceId,
  entry: SessionEntry,
  source: RenderKeySource,
  nextRenderKey: NextRenderKey,
): SessionEntry {
  if (entry.id || entry.__renderKey) return entry;
  return { ...entry, __renderKey: nextRenderKey(instanceId, source) };
}

function normalizeSessionEntriesForRender(
  instanceId: InstanceId,
  entries: SessionEntry[],
  source: RenderKeySource,
  nextRenderKey: NextRenderKey,
) {
  return entries.map((entry) =>
    ensureRenderKey(instanceId, entry, source, nextRenderKey),
  );
}

function createSessionMessageEntry(
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

// ── Hook ──

export function useConversation() {
  const renderKeySeqRef = useRef(0);
  const nextRenderKey = useCallback<NextRenderKey>((instanceId, source) => {
    return `${instanceId}:${source}:${renderKeySeqRef.current++}`;
  }, []);

  const [conversation, setConversation] = useState<ConversationState>(() =>
    createConversationState(),
  );

  const startInstanceRefresh = useCallback((instanceId: InstanceId) => {
    setConversation((prev) => beginInstanceRefresh(prev, instanceId));
  }, []);

  const startContentRefresh = useCallback(
    (instanceId: InstanceId, options?: { scrollToBottom?: boolean }) => {
      setConversation((prev) => beginContentRefresh(prev, instanceId, options));
    },
    [],
  );

  const startLoadMore = useCallback(() => {
    setConversation((prev) => beginLoadMore(prev));
  }, []);

  const setDraft = useCallback(
    (instanceId: InstanceId, value: InputDraftUpdater) => {
      setConversation((prev) => {
        const current = getInstanceDraft(prev.drafts, instanceId);
        const next = typeof value === "function" ? value(current) : value;
        return {
          ...prev,
          drafts: setInstanceDraft(prev.drafts, instanceId, next),
        };
      });
    },
    [],
  );

  const clearScrollToBottom = useCallback(() => {
    setConversation((prev) => {
      if (!prev.shouldScrollToBottom) return prev;
      return { ...prev, shouldScrollToBottom: false };
    });
  }, []);

  const setSessionListLoading = useCallback((loading: boolean) => {
    setConversation((prev) => ({
      ...prev,
      sessionListLoading: loading,
    }));
  }, []);

  /** 应用 history 响应 */
  const applyHistory = useCallback(
    (instanceId: InstanceId, messages: SessionEntry[], hasMore: boolean) => {
      const newEntries = normalizeSessionEntriesForRender(
        instanceId,
        messages,
        "history",
        nextRenderKey,
      );
      setConversation((prev) =>
        applyHistoryResponse(prev, instanceId, newEntries, hasMore),
      );
    },
    [nextRenderKey],
  );

  /** 应用错误 */
  const applyError = useCallback((message: string) => {
    setConversation((prev) => applyConversationError(prev, message));
  }, []);

  /** 应用 session 列表 */
  const applySessionList = useCallback(
    (instanceId: InstanceId, sessions: SessionListItem[]) => {
      setConversation((prev) => {
        if (prev.currentInstanceId !== instanceId) return prev;
        return {
          ...prev,
          sessionList: sessions,
          sessionListLoading: false,
        };
      });
    },
    [],
  );

  /** 处理 streaming 事件（message_start / message_update / message_end） */
  const handleStreamEvent = useCallback(
    (instanceId: InstanceId, event: string, data: unknown) => {
      const d = data as Record<string, unknown>;

      switch (event) {
        case "message_start": {
          const message = d.message as SessionEntry["message"];
          if (!message || message.role !== "assistant") break;

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
    },
    [nextRenderKey],
  );

  return {
    conversation,
    startInstanceRefresh,
    startContentRefresh,
    startLoadMore,
    setDraft,
    clearScrollToBottom,
    setSessionListLoading,
    applyHistory,
    applyError,
    applySessionList,
    handleStreamEvent,
  };
}
