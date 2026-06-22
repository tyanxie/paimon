// 连接状态指示点：乐观绿 + 断连即红

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useWebSocket } from "../../stores/useWebSocket";

/**
 * 自包含的连接状态指示组件。
 * - 首次 connecting 阶段乐观显示绿色
 * - 一旦经历过 disconnected，只有 connected 才能恢复绿色
 */
export function ConnectionIndicator() {
  const { t } = useTranslation();
  const connectionState = useWebSocket((s) => s.connectionState);
  const hasDisconnectedRef = useRef(false);

  if (connectionState === "disconnected") hasDisconnectedRef.current = true;
  if (connectionState === "connected") hasDisconnectedRef.current = false;

  const isDisconnected =
    hasDisconnectedRef.current && connectionState !== "connected";

  return (
    <span
      className={`w-2 h-2 rounded-full transition-colors ${isDisconnected ? "bg-red-500" : "bg-green-500"}`}
      title={isDisconnected ? t("common.offline") : t("common.online")}
    />
  );
}
