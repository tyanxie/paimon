// 任务完成系统通知：检测实例 streaming/compacting → idle 转换，弹系统通知
//
// 内部维护 prevStatusMap 记录各实例上一次状态，不依赖 subscribe 注册顺序。
// 仅在页面失焦（document.hasFocus() === false）时弹系统通知。

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import i18next from "i18next";
import { useWebSocket } from "../stores/useWebSocket";
import { useInstances } from "../stores/useInstances";
import { useSettings } from "../stores/useSettings";
import { getCurrentLogoSrc } from "./useLogoSrc";
import type {
  InstanceId,
  InstanceStatus,
  HubToBrowserMessage,
} from "../../../protocol/types";

/** 是否支持 Notification API */
export const supportsNotification = "Notification" in window;

/** 是否属于"忙碌 → 空闲"的完成转换 */
function isCompletionTransition(
  prev: InstanceStatus | undefined,
  next: InstanceStatus,
): boolean {
  return (prev === "streaming" || prev === "compacting") && next === "idle";
}

/**
 * 挂载任务完成通知。内部维护 prevStatusMap 跟踪状态变化，
 * 不依赖外部 subscribe 顺序。
 */
export function useTaskNotifier() {
  const subscribe = useWebSocket((s) => s.subscribe);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // 用 ref 读取最新设置，避免 subscribe handler 闭包过时
  const notificationRef = useRef(useSettings.getState().notification);
  useEffect(() => {
    return useSettings.subscribe((state) => {
      notificationRef.current = state.notification;
    });
  }, []);

  // 维护各实例的上一次状态
  const prevStatusMap = useRef<Map<InstanceId, InstanceStatus>>(new Map());

  // 初始化 prevStatusMap（从当前 store 快照）
  useEffect(() => {
    const instances = useInstances.getState().instances;
    for (const inst of instances) {
      prevStatusMap.current.set(inst.id, inst.status);
    }
  }, []);

  useEffect(() => {
    return subscribe((msg: HubToBrowserMessage) => {
      // 同步 instance_list 到 prevStatusMap
      if (msg.type === "instance_list") {
        prevStatusMap.current.clear();
        for (const inst of msg.payload.instances) {
          prevStatusMap.current.set(inst.id, inst.status);
        }
        return;
      }

      if (msg.type === "instance_update") {
        const { action, instance } = msg.payload;

        if (action === "disconnected") {
          prevStatusMap.current.delete(instance.id);
          return;
        }

        const prevStatus = prevStatusMap.current.get(instance.id);
        // 更新 map（无论是否需要通知）
        prevStatusMap.current.set(instance.id, instance.status);

        if (action === "updated" && notificationRef.current) {
          if (isCompletionTransition(prevStatus, instance.status)) {
            showCompletionNotification(instance.id, instance.cwd, navigateRef);
          }
        }
      }
    });
  }, [subscribe]);
}

/** 弹出系统通知 */
function showCompletionNotification(
  instanceId: InstanceId,
  cwd: string,
  navigateRef: React.RefObject<(path: string) => void>,
) {
  // 用户正在看页面时不弹系统通知
  if (document.hasFocus()) return;
  if (!supportsNotification || Notification.permission !== "granted") return;

  const dirName = cwd.split("/").pop() || cwd;
  // 不设 tag：同 tag 的通知会静默替换旧通知（无声音/无弹窗动画），
  // 导致同一实例连续完成任务时后续通知不可见。
  const notification = new Notification("Paimon", {
    body: i18next.t("notification.taskComplete", { name: dirName }),
    icon: getCurrentLogoSrc(),
  });

  // 点击通知：聚焦窗口并导航到对应实例
  notification.onclick = () => {
    window.focus();
    navigateRef.current?.(`/instance/${instanceId}`);
    notification.close();
  };
}
