// 任务完成系统通知：收到 agent_settled 的 completed 结果后弹出系统通知
//
// 仅在页面失焦（document.hasFocus() === false）时弹出系统通知。

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import i18next from "i18next";
import { useWebSocket } from "../stores/useWebSocket";
import { useSettings } from "../stores/useSettings";
import { getCurrentLogoSrc } from "./useLogoSrc";
import type {
  InstanceId,
  HubInstanceUpdateMessage,
  HubToBrowserMessage,
} from "../../../protocol/types";

/** 是否支持 Notification API */
export const supportsNotification = "Notification" in window;

/** 是否为需要发送完成通知的状态更新 */
export function isCompletedSettlement(
  payload: HubInstanceUpdateMessage["payload"],
): boolean {
  return payload.action === "updated" && payload.settledOutcome === "completed";
}

/** 挂载任务完成通知。 */
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

  useEffect(() => {
    return subscribe((msg: HubToBrowserMessage) => {
      if (
        msg.type === "instance_update" &&
        notificationRef.current &&
        isCompletedSettlement(msg.payload)
      ) {
        const { instance } = msg.payload;
        showCompletionNotification(instance.id, instance.cwd, navigateRef);
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
