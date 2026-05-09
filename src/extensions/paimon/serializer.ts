// Pi 事件序列化：将 pi 事件转换为协议消息

import type { ExtEventMessage } from "../../protocol/types";

/** 需要转发的 pi 事件列表（仅前端实际使用的） */
export const FORWARDED_EVENTS = [
  "message_start",
  "message_update",
  "message_end",
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
