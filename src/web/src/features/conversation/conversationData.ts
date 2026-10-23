import { isRecord } from "../../utils/typeGuards";
import type {
  ConversationToolEvent,
  SessionEntry,
  SessionMessage,
} from "./types";

/** 检查消息外层，原始 content 与扩展字段保持原样。 */
export function isSessionMessage(value: unknown): value is SessionMessage {
  return (
    isRecord(value) && typeof value.role === "string" && "content" in value
  );
}

/** 检查历史条目的公共字段，保留未知条目类型与分页数量。 */
export function isSessionEntry(value: unknown): value is SessionEntry {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  for (const key of ["id", "__renderKey", "timestamp", "summary"]) {
    if (value[key] !== undefined && typeof value[key] !== "string")
      return false;
  }
  return (
    (value.parentId === undefined ||
      value.parentId === null ||
      typeof value.parentId === "string") &&
    (value.message === undefined || isSessionMessage(value.message))
  );
}

/** 识别对话消费的工具事件字段，保留原始结果和扩展字段。 */
export function isConversationToolEvent(
  value: unknown,
): value is ConversationToolEvent {
  if (
    !isRecord(value) ||
    typeof value.toolCallId !== "string" ||
    !value.toolCallId
  )
    return false;
  if (
    value.parentToolCallId !== undefined &&
    typeof value.parentToolCallId !== "string"
  )
    return false;
  switch (value.type) {
    case "tool_execution_start":
    case "tool_execution_update":
      return true;
    case "tool_execution_end":
      return (
        typeof value.isError === "boolean" &&
        (value.durationMs === undefined || typeof value.durationMs === "number")
      );
    default:
      return false;
  }
}
