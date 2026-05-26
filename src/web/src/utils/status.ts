// 实例状态工具函数

import type { InstanceStatus } from "../../../protocol/types";

/** 是否正在流式生成（显示 stop 按钮） */
export const isStreaming = (s?: InstanceStatus): boolean => s === "streaming";

/** 是否忙碌（禁止发送、禁止切 session） */
export const isBusy = (s?: InstanceStatus): boolean =>
  s !== undefined && s !== "idle";
