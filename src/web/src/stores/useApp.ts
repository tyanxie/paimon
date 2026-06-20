// 应用状态编排：组合 useInstances + useConversation + WS 消息路由

import { useState, useCallback } from "react";
import type { HubToBrowserMessage, InstanceId } from "../../../protocol/types";
import type { SessionEntry, InputDraftUpdater } from "./types";
import { EMPTY_DRAFT } from "./types";
import { useInstances } from "./useInstances";
import { useConversation, getInstanceDraft } from "./useConversation";

export function useApp() {
  const {
    instances,
    setInstances,
    instanceListReady,
    setInstanceListReady,
    sessionIdMapRef,
    statusMapRef,
  } = useInstances();

  const {
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
  } = useConversation();

  // 当前查看的实例 sessionId 变化时设置为该 instanceId，App 层监听并重新拉取 history
  const [sessionChangedInstanceId, setSessionChangedInstanceId] =
    useState<InstanceId | null>(null);

  const clearSessionChanged = useCallback(() => {
    setSessionChangedInstanceId(null);
  }, []);

  // WS 消息路由
  const handleMessage = useCallback(
    (msg: HubToBrowserMessage) => {
      switch (msg.type) {
        case "instance_list":
          setInstances(msg.payload.instances);
          setInstanceListReady(true);
          // 初始化 sessionId 和 status 跟踪
          for (const inst of msg.payload.instances) {
            sessionIdMapRef.current.set(inst.id, inst.sessionId);
            statusMapRef.current.set(inst.id, inst.status);
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
            sessionIdMapRef.current.set(
              msg.payload.instance.id,
              msg.payload.instance.sessionId,
            );
            statusMapRef.current.set(
              msg.payload.instance.id,
              msg.payload.instance.status,
            );
          } else if (msg.payload.action === "disconnected") {
            setInstances((prev) =>
              prev.filter((i) => i.id !== msg.payload.instance.id),
            );
            sessionIdMapRef.current.delete(msg.payload.instance.id);
            statusMapRef.current.delete(msg.payload.instance.id);
          } else if (msg.payload.action === "updated") {
            const inst = msg.payload.instance;
            const prevSessionId = sessionIdMapRef.current.get(inst.id);
            const prevStatus = statusMapRef.current.get(inst.id);
            // 只在 sessionId 有效时更新 map，避免 ctx 未就绪时 undefined 覆盖有效值
            if (inst.sessionId !== undefined) {
              sessionIdMapRef.current.set(inst.id, inst.sessionId);
            }
            statusMapRef.current.set(inst.id, inst.status);

            setInstances((prev) =>
              prev.map((i) => (i.id === inst.id ? inst : i)),
            );

            // sessionId 变化且是当前查看的实例 → 通知 App 层重新拉取 history
            if (
              prevSessionId !== undefined &&
              inst.sessionId !== undefined &&
              inst.sessionId !== prevSessionId
            ) {
              startContentRefresh(inst.id);
              setSessionChangedInstanceId(inst.id);
            }

            // compacting → 非 compacting：压缩完成（或取消），重新拉取 history
            if (prevStatus === "compacting" && inst.status !== "compacting") {
              startContentRefresh(inst.id, { scrollToBottom: true });
              setSessionChangedInstanceId(inst.id);
            }
          }
          break;

        case "forwarded_event":
          handleStreamEvent(
            msg.payload.instanceId,
            msg.payload.event,
            msg.payload.data,
          );
          break;

        case "history": {
          const instanceId = msg.payload.instanceId;
          const messages = msg.payload.messages as SessionEntry[];
          const hasMore = (msg.payload as any).hasMore ?? false;
          applyHistory(instanceId, messages, hasMore);
          break;
        }

        case "error":
          console.error("[Paimon]", msg.payload.message);
          applyError(msg.payload.message);
          break;

        case "session_list":
          applySessionList(msg.payload.instanceId, msg.payload.sessions);
          break;
      }
    },
    [
      setInstances,
      setInstanceListReady,
      sessionIdMapRef,
      statusMapRef,
      startContentRefresh,
      handleStreamEvent,
      applyHistory,
      applyError,
      applySessionList,
    ],
  );

  return {
    // 实例列表
    instances,
    instanceListReady,
    // 对话状态
    entries: conversation.entries,
    streamingEntry: conversation.streamingEntry,
    hasMore: conversation.hasMore,
    loadState: conversation.loadState,
    errorMessage: conversation.errorMessage,
    shouldScrollToBottom: conversation.shouldScrollToBottom,
    draft: getInstanceDraft(
      conversation.drafts,
      conversation.currentInstanceId,
    ),
    sessionList: conversation.sessionList,
    sessionListLoading: conversation.sessionListLoading,
    // session 变化通知
    sessionChangedInstanceId,
    // 操作方法
    handleMessage,
    startInstanceRefresh,
    startLoadMore,
    setDraft,
    setSessionListLoading,
    clearScrollToBottom,
    clearSessionChanged,
  };
}
