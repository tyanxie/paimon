import { describe, expect, test } from "bun:test";
import {
  isConversationToolEvent,
  isSessionEntry,
  isSessionMessage,
} from "./conversationData";

describe("对话原始数据识别", () => {
  test("历史条目保留未知类型、扩展字段与根条目 parentId", () => {
    const entries: unknown[] = [
      Object.freeze({
        type: "future_entry",
        id: "future",
        parentId: null,
        extra: { value: 1 },
      }),
      Object.freeze({
        type: "message",
        id: "message",
        message: {
          role: "future_role",
          content: [{ type: "future_block" }],
          extra: true,
        },
      }),
    ];
    expect(entries.every(isSessionEntry)).toBe(true);
    expect(entries[0]).toEqual({
      type: "future_entry",
      id: "future",
      parentId: null,
      extra: { value: 1 },
    });
  });

  test("消息内容保持 unknown，外层字段检查拒绝无效数据", () => {
    expect(isSessionMessage({ role: "assistant", content: [] })).toBe(true);
    expect(isSessionMessage({ role: "user", content: "question" })).toBe(true);
    for (const value of [
      null,
      [],
      "message",
      { role: 1, content: [] },
      { role: "assistant" },
    ]) {
      expect(isSessionMessage(value)).toBe(false);
    }
    for (const value of [
      null,
      [],
      { type: 1 },
      { type: "message", id: 1 },
      { type: "message", message: null },
      { type: "compaction", summary: [] },
    ]) {
      expect(isSessionEntry(value)).toBe(false);
    }
  });
});

describe("工具事件数据识别", () => {
  test("开始、更新与结束保留原始结果和扩展字段", () => {
    const partial = { content: [{ type: "text", text: "partial" }] };
    const result = { content: [], details: { custom: true } };
    expect(
      isConversationToolEvent({
        type: "tool_execution_start",
        toolCallId: "one",
      }),
    ).toBe(true);
    const update: unknown = {
      type: "tool_execution_update",
      toolCallId: "one",
      partialResult: partial,
      extra: true,
    };
    expect(isConversationToolEvent(update)).toBe(true);
    if (
      !isConversationToolEvent(update) ||
      update.type !== "tool_execution_update"
    )
      throw new Error("Expected tool update");
    expect(update.partialResult).toBe(partial);
    const end: unknown = {
      type: "tool_execution_end",
      toolCallId: "one",
      result,
      isError: false,
      durationMs: 10,
    };
    expect(isConversationToolEvent(end)).toBe(true);
    if (!isConversationToolEvent(end) || end.type !== "tool_execution_end")
      throw new Error("Expected tool ending");
    expect(end.result).toBe(result);
    expect(end.durationMs).toBe(10);
  });

  test("无效 identifier、结束字段和未知事件保持无效状态", () => {
    for (const value of [
      null,
      [],
      { type: "tool_execution_start", toolCallId: 1 },
      { type: "tool_execution_start", toolCallId: "" },
      { type: "tool_execution_start", toolCallId: "one", parentToolCallId: 1 },
    ]) {
      expect(isConversationToolEvent(value)).toBe(false);
    }
    expect(
      isConversationToolEvent({
        type: "tool_execution_end",
        toolCallId: "one",
        isError: "false",
      }),
    ).toBe(false);
    expect(
      isConversationToolEvent({
        type: "tool_execution_end",
        toolCallId: "one",
        isError: false,
        durationMs: "10",
      }),
    ).toBe(false);
    expect(
      isConversationToolEvent({ type: "future_event", toolCallId: "one" }),
    ).toBe(false);
  });
});
