// 实例列表全局 store：维护所有在线 pi 实例信息

import { create } from "zustand";
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

export const useInstances = create<InstancesState>((set, get) => ({
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
            const exists = state.instances.some((i) => i.id === instance.id);
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
}));

// ── 便捷 selector ──

/** 获取指定实例（组件中使用：useInstances(selectInstance(id))） */
export function selectInstance(id: InstanceId | null) {
  return (state: InstancesState) =>
    id ? state.instances.find((i) => i.id === id) : undefined;
}
