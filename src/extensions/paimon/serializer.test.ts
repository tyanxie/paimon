import { describe, expect, test } from "bun:test";
import { FORWARDED_EVENTS, serializeEvent } from "./serializer";

describe("Pi event forwarding", () => {
  test("preserves message events and adds tool lifecycle events", () => {
    expect(FORWARDED_EVENTS).toEqual([
      "message_start",
      "message_update",
      "message_end",
      "tool_execution_start",
      "tool_execution_update",
      "tool_execution_end",
    ]);
  });

  test("preserves tool event payloads", () => {
    const data = {
      toolCallId: "call-1",
      toolName: "bash",
      result: { content: [] },
      isError: true,
      durationMs: 123,
    };
    const message = serializeEvent("tool_execution_end", data);
    expect(message.type).toBe("event");
    expect(message.payload.data).toBe(data);
    expect(message.payload.timestamp).toBeGreaterThan(0);
  });
});
