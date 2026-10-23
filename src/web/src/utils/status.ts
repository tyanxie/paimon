// 实例状态工具函数

import type { InstanceStatus } from "../../../protocol/types";

/** 是否忙碌（禁止发送、禁止切 session） */
export const isBusy = (s?: InstanceStatus): boolean =>
  s !== undefined && s !== "idle";

export function getInstanceStatusKey(status?: InstanceStatus): string {
  return status === "streaming"
    ? "sidebar.statusStreaming"
    : status === "compacting"
      ? "sidebar.statusCompacting"
      : status === "idle"
        ? "sidebar.statusIdle"
        : "sidebar.statusPending";
}

export function getInstanceStatusDotClass(status?: InstanceStatus): string {
  return status === "streaming"
    ? "bg-[var(--color-accent)] animate-pulse motion-reduce:animate-none"
    : status === "compacting"
      ? "bg-[var(--toast-icon-warning)] animate-pulse motion-reduce:animate-none"
      : status === "idle"
        ? "bg-[var(--toast-icon-success)]"
        : "bg-[var(--label-secondary)]";
}
