// 全局状态管理

import { useState, useCallback } from "react";
import type {
  InstanceInfo,
  HubToBrowserMessage,
  InstanceId,
} from "../../../protocol/types";

export interface AppState {
  instances: InstanceInfo[];
  selectedInstanceId: InstanceId | null;
  events: Array<{
    instanceId: InstanceId;
    event: string;
    data: unknown;
    timestamp: number;
  }>;
}

export function useAppState() {
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] =
    useState<InstanceId | null>(null);
  const [events, setEvents] = useState<AppState["events"]>([]);

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
          // 如果选中的实例断开，清除选中
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
        setEvents((prev) => [
          ...prev.slice(-500), // 保留最近 500 条
          {
            instanceId: msg.payload.instanceId,
            event: msg.payload.event,
            data: msg.payload.data,
            timestamp: msg.payload.timestamp,
          },
        ]);
        break;
      case "history":
        // TODO: 处理历史消息
        break;
      case "error":
        console.error("[Paimon]", msg.payload.message);
        break;
    }
  }, []);

  return {
    instances,
    selectedInstanceId,
    setSelectedInstanceId,
    events,
    handleMessage,
  };
}
