// WS 订阅生命周期管理：确保当前查看的实例有且仅有一个活跃订阅

import { useEffect, useRef } from "react";
import type {
  InstanceId,
  InstanceInfo,
  BrowserToHubMessage,
} from "../../../protocol/types";

type SendFn = (msg: BrowserToHubMessage) => void;

export function useSubscription(
  selectedInstanceId: InstanceId | null,
  instances: InstanceInfo[],
  connected: boolean,
  send: SendFn,
  startInstanceRefresh: (id: InstanceId) => void,
  sessionChangedInstanceId: InstanceId | null,
  clearSessionChanged: () => void,
) {
  const subscribedRef = useRef<InstanceId | null>(null);

  // 监听 selectedInstanceId / 连接状态变化，管理订阅
  useEffect(() => {
    // WS 未连接时重置订阅状态（服务端订阅已随旧连接丢失）
    if (!connected) {
      subscribedRef.current = null;
      return;
    }

    // selectedInstanceId 为 null（去设置页/首页）时保持订阅不动
    if (!selectedInstanceId) return;

    if (selectedInstanceId === subscribedRef.current) return;

    // 切换到了另一个实例，取消订阅旧的
    if (subscribedRef.current) {
      send({
        type: "unsubscribe",
        payload: { instanceId: subscribedRef.current },
      });
      subscribedRef.current = null;
    }

    // 订阅新实例，并把右侧对话区切入刷新态
    const exists = instances.some((i) => i.id === selectedInstanceId);
    if (exists) {
      startInstanceRefresh(selectedInstanceId);
      send({
        type: "subscribe",
        payload: { instanceId: selectedInstanceId },
      });
      subscribedRef.current = selectedInstanceId;
      send({
        type: "get_history",
        payload: { instanceId: selectedInstanceId },
      });
    }
    // exists 为 false 时不更新 ref，等 instances 加载后重试
  }, [selectedInstanceId, instances, connected, send, startInstanceRefresh]);

  // sessionId 变化时重新拉取 history（/new 、/reload 等场景）
  useEffect(() => {
    if (!sessionChangedInstanceId) return;
    if (connected) {
      send({
        type: "get_history",
        payload: { instanceId: sessionChangedInstanceId },
      });
    }
    clearSessionChanged();
  }, [sessionChangedInstanceId, connected, send, clearSessionChanged]);
}
