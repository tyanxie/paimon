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

export function useAppState() {
  const [instances, setInstances] = useState<InstanceInfo[]>([]);

  // 已完成的历史消息（来自 history 响应 + message_end 追加）
  const [historyEntries, setHistoryEntries] = useState<
    Map<InstanceId, SessionEntry[]>
  >(new Map());

  // 当前正在 streaming 的消息（每实例至多一条）
  const [streamingEntry, setStreamingEntry] = useState<
    Map<InstanceId, SessionEntry | null>
  >(new Map());

  // 每个实例是否还有更早的历史可加载
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

        // history 只含已完成消息，prepend 到 historyEntries 开头
        setHistoryEntries((prev) => {
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
        if (!message) break;

        if (message.role === "assistant") {
          // assistant 消息进入 streaming 阶段
          setStreamingEntry((prev) => {
            const next = new Map(prev);
            next.set(instanceId, {
              type: "message",
              timestamp: new Date().toISOString(),
              message,
            });
            return next;
          });
        }
        // user / toolResult 的 message_start 不处理，等 message_end 时直接入 history
        break;
      }
      case "message_update": {
        const message = d.message as SessionEntry["message"];
        if (!message) break;

        setStreamingEntry((prev) => {
          const current = prev.get(instanceId);
          if (current) {
            // 已有 streaming entry：更新内容
            const next = new Map(prev);
            next.set(instanceId, { ...current, message });
            return next;
          } else {
            // 刷新后场景：隐式创建 streaming entry
            const next = new Map(prev);
            next.set(instanceId, {
              type: "message",
              timestamp: new Date().toISOString(),
              message,
            });
            return next;
          }
        });
        break;
      }
      case "message_end": {
        const message = d.message as SessionEntry["message"];

        // 清除 streaming entry
        setStreamingEntry((prev) => {
          const next = new Map(prev);
          next.set(instanceId, null);
          return next;
        });

        // 将完成的消息 append 到 historyEntries
        if (message) {
          setHistoryEntries((prev) => {
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
        }
        break;
      }
    }
  }

  return {
    instances,
    historyEntries,
    streamingEntry,
    hasMore,
    handleMessage,
  };
}
