// 全局状态管理

import { useState, useCallback } from "react";
import type {
  InstanceInfo,
  HubToBrowserMessage,
  InstanceId,
} from "../../../protocol/types";

/** 统一的 session entry（来自 getBranch 或实时事件构造） */
export interface SessionEntry {
  type: string;
  id?: string;
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

export interface AppState {
  instances: InstanceInfo[];
  /** 每个实例的统一对话 entries 列表 */
  entries: Map<InstanceId, SessionEntry[]>;
  /** 当前正在流式输出的实例（用于 loading 指示） */
  streamingInstances: Set<InstanceId>;
  /** 每个实例是否还有更早的历史可加载 */
  hasMore: Map<InstanceId, boolean>;
}

export function useAppState() {
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [entries, setEntries] = useState<Map<InstanceId, SessionEntry[]>>(
    new Map(),
  );
  const [streamingInstances, setStreamingInstances] = useState<Set<InstanceId>>(
    new Set(),
  );
  const [hasMore, setHasMore] = useState<Map<InstanceId, boolean>>(new Map());

  const handleMessage = useCallback((msg: HubToBrowserMessage) => {
    switch (msg.type) {
      case "instance_list":
        setInstances(msg.payload.instances);
        break;
      case "instance_update":
        if (msg.payload.action === "connected") {
          setInstances((prev) => [...prev, msg.payload.instance]);
        } else if (msg.payload.action === "disconnected") {
          setInstances((prev) =>
            prev.filter((i) => i.id !== msg.payload.instance.id),
          );
        } else if (msg.payload.action === "updated") {
          setInstances((prev) =>
            prev.map((i) =>
              i.id === msg.payload.instance.id ? msg.payload.instance : i,
            ),
          );
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
        const newEntries = msg.payload.messages as SessionEntry[];
        const more = (msg.payload as any).hasMore ?? false;

        setHasMore((prev) => {
          const next = new Map(prev);
          next.set(instanceId, more);
          return next;
        });

        // history 只含已完成的消息，prepend 到开头，不会与末尾的 streaming 消息冲突
        setEntries((prev) => {
          const next = new Map(prev);
          const existing = prev.get(instanceId) ?? [];
          next.set(instanceId, [...newEntries, ...existing]);
          return next;
        });
        break;
      }
      case "error":
        console.error("[Paimon]", msg.payload.message);
        break;
    }
  }, []);

  /** 处理实时事件，更新 entries 列表 */
  function handleForwardedEvent(
    instanceId: InstanceId,
    event: string,
    data: unknown,
  ) {
    const d = data as Record<string, unknown>;

    switch (event) {
      case "message_start": {
        // 新消息开始，追加到列表
        const message = d.message as SessionEntry["message"];
        if (message) {
          setEntries((prev) => {
            const next = new Map(prev);
            const list = [...(prev.get(instanceId) ?? [])];
            list.push({
              type: "message",
              timestamp: new Date().toISOString(),
              message,
            });
            next.set(instanceId, list);
            return next;
          });
          // 标记正在流式输出
          if (message.role === "assistant") {
            setStreamingInstances((prev) => new Set(prev).add(instanceId));
          }
        }
        break;
      }
      case "message_update": {
        const message = d.message as SessionEntry["message"];
        if (!message) break;

        setStreamingInstances((prev) => {
          if (prev.has(instanceId)) {
            // 已在 streaming：更新最后一条 message entry
            setEntries((prevEntries) => {
              const next = new Map(prevEntries);
              const list = [...(prevEntries.get(instanceId) ?? [])];
              for (let i = list.length - 1; i >= 0; i--) {
                if (list[i].type === "message") {
                  list[i] = { ...list[i], message };
                  break;
                }
              }
              next.set(instanceId, list);
              return next;
            });
            return prev;
          } else {
            // 未在 streaming（刷新后场景）：隐式 start + 设 streaming
            setEntries((prevEntries) => {
              const next = new Map(prevEntries);
              const list = [...(prevEntries.get(instanceId) ?? [])];
              list.push({
                type: "message",
                timestamp: new Date().toISOString(),
                message,
              });
              next.set(instanceId, list);
              return next;
            });
            return new Set(prev).add(instanceId);
          }
        });
        break;
      }
      case "message_end": {
        // 流式输出结束
        setStreamingInstances((prev) => {
          const next = new Set(prev);
          next.delete(instanceId);
          return next;
        });
        break;
      }
      // 其他事件暂不处理，后续可扩展
    }
  }

  return {
    instances,
    entries,
    streamingInstances,
    hasMore,
    handleMessage,
  };
}
