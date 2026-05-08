// Pi 事件序列化：将 pi 事件转换为协议消息

import type { ExtEventMessage } from "../../protocol/types";

/** 需要转发的 pi 事件列表 */
export const FORWARDED_EVENTS = [
  "message_update",
  "tool_execution_start",
  "tool_execution_end",
  "tool_execution_error",
  "session_start",
  "session_end",
  "error",
] as const;

/** 将 pi 事件包装为协议消息 */
export function serializeEvent(event: string, data: unknown): ExtEventMessage {
  return {
    type: "event",
    payload: {
      event,
      data,
      timestamp: Date.now(),
    },
  };
}
