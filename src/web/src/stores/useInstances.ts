// 实例列表全局 store：维护所有在线 pi 实例信息
//
// 使用 zustand persist 中间件将 instances 数组持久化到 localStorage，
// 刷新页面时立即恢复上次的实例列表，避免 "空 → 有数据" 的视觉跳变。
// instanceListReady 不持久化，始终从 false 开始，等 WS 确认后再标记为 true。

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  InstanceId,
  InstanceInfo,
  HubToBrowserMessage,
} from "../../../protocol/types";

interface InstancesState {
  instances: InstanceInfo[];
  /** 是否已收到过 instance_list（避免初始化阶段误判实例不存在） */
  instanceListReady: boolean;
  /** 处理来自 WS 的实例相关消息 */
  handleMessage: (msg: HubToBrowserMessage) => void;
}

export const useInstances = create<InstancesState>()(
  persist(
    (set, get) => ({
      instances: [],
      instanceListReady: false,

      handleMessage: (msg) => {
        switch (msg.type) {
          case "instance_list":
            set({
              instances: msg.payload.instances,
              instanceListReady: true,
            });
            break;

          case "instance_update": {
            const { instance, action } = msg.payload;

            if (action === "connected") {
              set((state) => {
                const exists = state.instances.some(
                  (i) => i.id === instance.id,
                );
                return {
                  instances: exists
                    ? state.instances.map((i) =>
                        i.id === instance.id ? instance : i,
                      )
                    : [...state.instances, instance],
                };
              });
            } else if (action === "disconnected") {
              set((state) => ({
                instances: state.instances.filter((i) => i.id !== instance.id),
              }));
            } else if (action === "updated") {
              set((state) => ({
                instances: state.instances.map((i) =>
                  i.id === instance.id ? instance : i,
                ),
              }));
            }
            break;
          }
        }
      },
    }),
    {
      name: "paimon:instances",
      // 只持久化 instances 数组；instanceListReady 和函数不写入 localStorage
      partialize: (state) => ({ instances: state.instances }),
    },
  ),
);

// ── 便捷 selector ──

/** 获取指定实例（组件中使用：useInstances(selectInstance(id))） */
export function selectInstance(id: InstanceId | null) {
  return (state: InstancesState) =>
    id ? state.instances.find((i) => i.id === id) : undefined;
}
