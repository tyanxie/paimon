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
const originalSocketState = useWebSocket.getState();

function Probe() {
  state = useConversation(instanceId, undefined);
  return null;
}

async function event(name: string, data: unknown, id = instanceId) {
  await act(async () =>
    handler({
      type: "forwarded_event",
      payload: { instanceId: id, event: name, data, timestamp: Date.now() },
    }),
  );
}

async function history(messages: unknown[] = []) {
  await act(async () =>
    handler({
      type: "history",
      payload: { instanceId, messages, hasMore: false },
    }),
  );
}

beforeEach(async () => {
  useWebSocket.setState({
    connectionState: "connected",
    send: () => {},
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
