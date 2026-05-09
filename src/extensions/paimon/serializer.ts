// Pi 事件序列化：将 pi 事件转换为协议消息

import type { ExtEventMessage } from "../../protocol/types";

/** 需要转发的 pi 事件列表（完整列表，来自 ExtensionAPI.on() 类型声明） */
export const FORWARDED_EVENTS = [
  "resources_discover",
  "session_start",
  "session_before_switch",
  "session_before_fork",
  "session_before_compact",
  "session_compact",
  "session_shutdown",
  "session_before_tree",
  "session_tree",
  "context",
  "before_provider_request",
  "after_provider_response",
  "before_agent_start",
  "agent_start",
  "agent_end",
  "turn_start",
  "turn_end",
  "message_start",
  "message_update",
  "message_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "model_select",
  "thinking_level_select",
  "tool_call",
  "tool_result",
  "user_bash",
  "input",
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
