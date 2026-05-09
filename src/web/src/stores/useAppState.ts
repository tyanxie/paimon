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
  selectedInstanceId: InstanceId | null;
  /** 每个实例的统一对话 entries 列表 */
  entries: Map<InstanceId, SessionEntry[]>;
  /** 当前正在流式输出的实例（用于 loading 指示） */
  streamingInstances: Set<InstanceId>;
}

export function useAppState() {
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] =
    useState<InstanceId | null>(null);
  const [entries, setEntries] = useState<Map<InstanceId, SessionEntry[]>>(
    new Map(),
  );
  const [streamingInstances, setStreamingInstances] = useState<Set<InstanceId>>(
    new Set(),
  );

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
          setSelectedInstanceId((prev) =>
            prev === msg.payload.instance.id ? null : prev,
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
      case "history":
        setEntries((prev) => {
          const next = new Map(prev);
          next.set(
            msg.payload.instanceId,
            msg.payload.messages as SessionEntry[],
          );
          return next;
        });
        break;
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
        // 替换列表最后一条 message entry（完整快照）
        const message = d.message as SessionEntry["message"];
        if (message) {
          setEntries((prev) => {
            const next = new Map(prev);
            const list = [...(prev.get(instanceId) ?? [])];
            // 找到最后一条 message entry 并替换
            for (let i = list.length - 1; i >= 0; i--) {
              if (list[i].type === "message") {
                list[i] = { ...list[i], message };
                break;
              }
            }
            next.set(instanceId, list);
            return next;
          });
        }
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
    selectedInstanceId,
    setSelectedInstanceId,
    entries,
    streamingInstances,
    handleMessage,
  };
}
