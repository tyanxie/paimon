// 实例状态工具函数

import type { InstanceStatus } from "../../../protocol/types";

/** 是否忙碌（禁止发送、禁止切 session） */
export const isBusy = (s?: InstanceStatus): boolean =>
  s !== undefined && s !== "idle";
