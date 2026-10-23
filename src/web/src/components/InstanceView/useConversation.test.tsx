import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "../../i18n";
import type {
  HubToBrowserMessage,
  InstanceId,
} from "../../../../protocol/types";
import { useWebSocket } from "../../stores/useWebSocket";
import { useConversation, type ConversationState } from "./useConversation";

const instanceId = "instance-1" as InstanceId;
let state: ConversationState;
let handler: (message: HubToBrowserMessage) => void;
let root: Root;
let container: HTMLDivElement;
let sentMessages: unknown[];
const originalSocketState = useWebSocket.getState();

function Probe() {
  state = useConversation(instanceId, undefined);
  return null;
}

async function event(
  name: string,
  data: unknown,
  id = instanceId,
  timestamp = Date.now(),
) {
  await act(async () =>
    handler({
      type: "forwarded_event",
      payload: { instanceId: id, event: name, data, timestamp },
    }),
  );
}

async function history(messages: unknown[] = [], hasMore = false) {
  await act(async () =>
    handler({
      type: "history",
      payload: { instanceId, messages, hasMore },
    }),
  );
}

beforeEach(async () => {
  sentMessages = [];
  useWebSocket.setState({
    connectionState: "connected",
    send: (message) => {
      sentMessages.push(message);
    },
    subscribe: (listener) => {
      handler = listener;
      return () => {};
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
  await history();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useWebSocket.setState(originalSocketState);
});

describe("useConversation tool lifecycle", () => {
  test("tracks concurrent calls independently without adding history entries", async () => {
    await event("tool_execution_start", {
      toolCallId: "one",
      toolName: "bash",
    });
    await event("tool_execution_start", {
      toolCallId: "two",
      toolName: "read",
    });
    await event("tool_execution_end", {
      toolCallId: "two",
      toolName: "read",
      result: { content: [] },
      isError: false,
      durationMs: 20,
    });
    expect(state.toolExecutions.get("one")?.status).toBe("running");
    expect(state.toolExecutions.get("one")?.startedAt).toBeNumber();
    expect(state.toolExecutions.get("two")?.status).toBe("completed");
    expect(state.entries).toHaveLength(0);
  });

  test("captures monotonic time when receiving a start event", async () => {
    const clock = spyOn(performance, "now").mockReturnValue(1234);
    try {
      await act(async () => {
        handler({
          type: "forwarded_event",
          payload: {
            instanceId,
            event: "tool_execution_start",
            data: { toolCallId: "one", toolName: "bash", args: {} },
            timestamp: Date.now(),
          },
        });
        clock.mockReturnValue(5678);
      });
      expect(state.toolExecutions.get("one")?.startedAt).toBe(1234);
      await event("tool_execution_update", {
        toolCallId: "one",
        toolName: "bash",
        args: {},
        partialResult: { content: [] },
      });
      expect(state.toolExecutions.get("one")?.startedAt).toBe(1234);
    } finally {
      clock.mockRestore();
    }
  });

  test("accepts updates and endings without a start and replaces snapshots", async () => {
    await event("tool_execution_update", {
      toolCallId: "one",
      partialResult: { content: "first" },
    });
    await event("tool_execution_update", {
      toolCallId: "one",
      partialResult: { content: "latest" },
    });
    const running = state.toolExecutions.get("one");
    expect(running?.startedAt).toBeUndefined();
    expect(running?.status === "running" && running.partialResult).toEqual({
      content: "latest",
    });
    await event("tool_execution_end", {
      toolCallId: "one",
      result: { content: "error" },
      isError: true,
      durationMs: 100,
    });
    await event("tool_execution_update", {
      toolCallId: "one",
      partialResult: { content: "late" },
    });
    const completed = state.toolExecutions.get("one");
    expect(completed?.status).toBe("completed");
    expect(completed?.status === "completed" && completed.isError).toBe(true);
    expect(completed?.status === "completed" && completed.durationMs).toBe(100);
  });

  test("ignores child calls and events from other instances", async () => {
    for (const name of [
      "tool_execution_start",
      "tool_execution_update",
      "tool_execution_end",
    ]) {
      await event(name, { toolCallId: "child", parentToolCallId: "parent" });
    }
    await event(
      "tool_execution_start",
      { toolCallId: "other" },
      "other-instance" as InstanceId,
    );
    expect(state.toolExecutions.size).toBe(0);
  });

  test("keeps live tool state through history loading and hands off to toolResult", async () => {
    await event("tool_execution_end", {
      toolCallId: "one",
      result: { content: "done" },
      isError: false,
      durationMs: 30,
    });
    await history();
    expect(state.toolExecutions.get("one")?.status).toBe("completed");
    await event("message_end", {
      message: {
        role: "toolResult",
        toolCallId: "one",
        content: [],
        durationMs: 30,
      },
    });
    expect(state.toolExecutions.has("one")).toBe(false);
    expect(state.entries).toHaveLength(1);
  });

  test("resets transient states on reconnection and accepts the next update", async () => {
    await event("tool_execution_start", { toolCallId: "one" });
    await act(async () =>
      useWebSocket.setState({ connectionState: "disconnected" }),
    );
    await act(async () =>
      useWebSocket.setState({ connectionState: "connected" }),
    );
    expect(state.toolExecutions.size).toBe(0);
    await event("tool_execution_update", {
      toolCallId: "one",
      partialResult: { content: "continued" },
    });
    expect(state.toolExecutions.get("one")?.startedAt).toBeUndefined();
    expect(state.toolExecutions.get("one")?.status).toBe("running");
  });
});

describe("useConversation 展示模型", () => {
  test("实时工具调用在消息完成后保留准备阶段并按事件更新", async () => {
    const message = {
      role: "assistant",
      content: ["one", "two"].map((id) => ({
        type: "toolCall",
        id,
        name: "bash",
        arguments: {},
      })),
    };
    const statuses = () =>
      state.displayItems.flatMap((item) =>
        item.type === "reply"
          ? item.parts.flatMap((part) =>
              part.type === "execution"
                ? part.items.flatMap((item) =>
                    item.type === "tool" ? [item.state.status] : [],
                  )
                : [],
            )
          : [],
      );
    await event("message_start", { message });
    expect(statuses()).toEqual(["pending", "pending"]);
    await event("message_end", { message });
    expect(statuses()).toEqual(["pending", "pending"]);
    await event("tool_execution_start", {
      toolCallId: "one",
      toolName: "bash",
    });
    expect(statuses()).toEqual(["running", "pending"]);
    await event("tool_execution_end", {
      toolCallId: "one",
      toolName: "bash",
      result: { content: [] },
      isError: false,
    });
    expect(statuses()).toEqual(["completed", "pending"]);
    await event("tool_execution_start", {
      toolCallId: "two",
      toolName: "bash",
    });
    expect(statuses()).toEqual(["completed", "running"]);
    await act(async () =>
      useWebSocket.setState({ connectionState: "disconnected" }),
    );
    await act(async () =>
      useWebSocket.setState({ connectionState: "connected" }),
    );
    await history([{ type: "message", id: "history", message }]);
    expect(statuses()).toEqual(["unknown", "unknown"]);
  });
  test("实时消息使用事件时间，增长与完成保留开始时间", async () => {
    const message = {
      role: "assistant",
      content: [{ type: "text", text: "body" }],
    };
    await event("message_start", { message }, instanceId, 1000);
    expect(state.streamingEntry!.timestamp).toBe(new Date(1000).toISOString());
    await event("message_update", { message }, instanceId, 2000);
    expect(state.streamingEntry!.timestamp).toBe(new Date(1000).toISOString());
    await event("message_end", { message }, instanceId, 3000);
    expect(state.entries[0]!.timestamp).toBe(new Date(1000).toISOString());
    await event(
      "message_end",
      { message: { role: "toolResult", toolCallId: "one", content: [] } },
      instanceId,
      4000,
    );
    expect(state.entries[1]!.timestamp).toBe(new Date(4000).toISOString());
  });

  test("隐式流式消息使用首次更新的事件时间", async () => {
    const message = { role: "assistant", content: [] };
    await event("message_update", { message }, instanceId, 5000);
    await event("message_end", { message }, instanceId, 6000);
    expect(state.entries[0]!.timestamp).toBe(new Date(5000).toISOString());
  });

  test("流式消息增长和完成保持回复与内容 key", async () => {
    await history([
      {
        type: "message",
        id: "u1",
        message: { role: "user", content: "question" },
      },
    ]);
    await event("message_start", {
      message: { role: "assistant", content: [] },
    });
    const replyKey = state.displayItems.at(-1)!.key;
    await event("message_update", {
      message: {
        role: "assistant",
        content: [{ type: "text", text: "partial" }],
      },
    });
    const reply = state.displayItems.at(-1)!;
    expect(reply.type).toBe("reply");
    if (reply.type !== "reply") throw new Error("Expected reply");
    const partKey = reply.parts[0]!.key;
    await event("message_end", {
      message: {
        role: "assistant",
        content: [{ type: "text", text: "complete" }],
      },
    });
    const completed = state.displayItems.at(-1)!;
    expect(completed.key).toBe(replyKey);
    if (completed.type !== "reply") throw new Error("Expected reply");
    expect(completed.parts[0]!.key).toBe(partKey);
    expect(state.isStreaming).toBe(false);
  });

  test("刷新后收到隐式 message_update 时完成消息仍保留 key", async () => {
    const message = {
      role: "assistant",
      content: [{ type: "toolCall", id: "one", name: "bash", arguments: {} }],
    };
    await event("message_update", { message });
    const entryKey = state.streamingEntry!.__renderKey;
    const reply = state.displayItems[0]!;
    if (reply.type !== "reply") throw new Error("Expected reply");
    const executionKey = reply.parts[0]!.key;
    await event("message_end", { message });
    expect(state.entries[0]!.__renderKey).toBe(entryKey);
    expect(state.displayItems[0]!.key).toBe(reply.key);
    const completed = state.displayItems[0]!;
    if (completed.type !== "reply") throw new Error("Expected reply");
    expect(completed.parts[0]!.key).toBe(executionKey);
  });

  test("分页 offset 使用已完成的原始 entry 数量", async () => {
    const rawEntries = [
      {
        type: "message",
        id: "u1",
        message: { role: "user", content: "question" },
      },
      {
        type: "message",
        id: "a1",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", id: "one", name: "bash", arguments: {} },
          ],
        },
      },
      {
        type: "message",
        id: "t1",
        message: { role: "toolResult", toolCallId: "one", content: [] },
      },
      {
        type: "message",
        id: "a2",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "body" }],
        },
      },
    ];
    await history(rawEntries, true);
    await event("message_start", {
      message: { role: "assistant", content: [] },
    });
    expect(state.entries).toHaveLength(5);
    expect(state.displayItems).toHaveLength(2);
    await act(async () => state.loadMore());
    expect(sentMessages).toContainEqual({
      type: "get_history",
      payload: { instanceId, offset: 4 },
    });
    await history([
      {
        type: "message",
        id: "older",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "old" }],
        },
      },
    ]);
    expect(state.entries).toHaveLength(6);
    expect(state.displayItems.at(-1)!.key).toBe("reply:u1");
  });
});
