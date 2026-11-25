import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  HubToBrowserMessage,
  InstanceId,
  InstanceInfo,
} from "../../../../protocol/types";
import "../../i18n";
import { useWebSocket } from "../../stores/useWebSocket";
import { useConversation, type ConversationState } from "./useConversation";
import * as http from "../../utils/authFetch";

const instanceId = "instance-1" as InstanceId;
let state: ConversationState;
let handler: (message: HubToBrowserMessage) => void;
let root: Root;
let container: HTMLDivElement;
let sentMessages: unknown[];
const originalSocketState = useWebSocket.getState();
let fetchSpy: ReturnType<typeof spyOn<typeof http, "authFetch">>;
let requests: {
  url: string;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal | null;
}[];

function Probe({
  instance,
  id = instanceId,
}: { instance?: InstanceInfo; id?: InstanceId } = {}) {
  state = useConversation(id, instance);
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
  const request = requests.at(-1)!;
  const sessionId =
    new URL(request.url, "http://localhost").searchParams.get("sessionId") ??
    undefined;
  await act(async () =>
    request.resolve(Response.json({ entries: messages, hasMore, sessionId })),
  );
}

beforeEach(async () => {
  sentMessages = [];
  requests = [];
  fetchSpy = spyOn(http, "authFetch").mockImplementation(
    (input, init) =>
      new Promise<Response>((resolve, reject) =>
        requests.push({
          url: String(input),
          resolve,
          reject,
          signal: init?.signal,
        }),
      ),
  );
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
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetchSpy.mockRestore();
  useWebSocket.setState(originalSocketState);
});

describe("历史 HTTP 查询隔离", () => {
  const entry = (id: string) => ({
    type: "message",
    id,
    message: { role: "user", content: id },
  });

  test("两个页面打开同一实例，A 分页不替换 B 的最新历史", async () => {
    let other: ConversationState;
    function OtherPage() {
      other = useConversation(instanceId, undefined);
      return null;
    }
    const a = requests.at(-1)!;
    const otherContainer = document.createElement("div");
    document.body.append(otherContainer);
    const otherRoot = createRoot(otherContainer);
    try {
      await act(async () => otherRoot.render(<OtherPage />));
      const b = requests.at(-1)!;
      await act(async () =>
        b.resolve(Response.json({ entries: [entry("latest")], hasMore: true })),
      );
      expect(state.loadState).toBe("refreshing");
      await act(async () =>
        a.resolve(Response.json({ entries: [entry("latest")], hasMore: true })),
      );
      await act(async () => state.loadMore());
      await history([entry("older")]);
      expect(state.entries.map((item) => item.id)).toEqual(["older", "latest"]);
      expect(other!.entries.map((item) => item.id)).toEqual(["latest"]);
      expect(other!.hasMore).toBe(true);
      expect(other!.loadState).toBe("idle");
      expect(
        sentMessages.some(
          (message) =>
            typeof message === "object" &&
            message !== null &&
            "type" in message &&
            message.type === "get_history",
        ),
      ).toBe(false);
    } finally {
      await act(async () => otherRoot.unmount());
      otherContainer.remove();
    }
  });

  test.each(["instance", "session"] as const)(
    "%s 切换后迟到的分页响应不污染新历史",
    async (change) => {
      const info: InstanceInfo = {
        id: instanceId,
        edgeId: "edge",
        hostname: "host",
        cwd: "/project",
        homedir: "/home",
        pid: 1,
        status: "idle",
        model: { provider: "provider", id: "model" },
        connectedAt: 0,
        lastHeartbeat: 0,
        sessionId: "one",
      };
      await act(async () => root.render(<Probe instance={info} />));
      await history([entry("latest")], true);
      await act(async () => state.loadMore());
      const old = requests.at(-1)!;
      const id = change === "instance" ? "other-instance" : instanceId;
      await act(async () =>
        root.render(
          <Probe id={id} instance={{ ...info, id, sessionId: "two" }} />,
        ),
      );
      expect(old.signal?.aborted).toBe(true);
      await act(async () =>
        old.resolve(
          Response.json({
            entries: [entry("old-page")],
            hasMore: false,
            sessionId: "one",
          }),
        ),
      );
      expect(state.entries).toEqual([]);
      expect(state.loadState).toBe("refreshing");
      await history([entry("new-session")]);
      expect(state.entries.map((item) => item.id)).toEqual(["new-session"]);
      expect(state.loadState).toBe("idle");
    },
  );

  test("重连忽略旧请求的迟到错误，卸载取消当前历史查询", async () => {
    const old = requests.at(-1)!;
    await act(async () =>
      useWebSocket.setState({ connectionState: "disconnected" }),
    );
    await act(async () =>
      useWebSocket.setState({ connectionState: "connected" }),
    );
    expect(old.signal?.aborted).toBe(true);
    await act(async () =>
      old.resolve(Response.json({ error: "old timeout" }, { status: 502 })),
    );
    expect(state.loadState).toBe("refreshing");
    expect(state.errorMessage).toBeNull();
    const current = requests.at(-1)!;
    await act(async () => root.unmount());
    expect(current.signal?.aborted).toBe(true);
  });

  test.each(["timeout", "server", "network"] as const)(
    "分页 %s 失败暂停自动加载，手动重试保留已有条目",
    async (failure) => {
      await history([entry("latest")], true);
      await act(async () => state.loadMore());
      const message =
        failure === "timeout"
          ? "Request timed out (10s)"
          : failure === "server"
            ? "Read failed"
            : "Network unavailable";
      await act(async () => {
        if (failure === "network")
          requests.at(-1)!.reject(new TypeError(message));
        else
          requests
            .at(-1)!
            .resolve(Response.json({ error: message }, { status: 502 }));
      });
      expect(state.loadState).toBe("loadingMoreError");
      expect(state.errorMessage).toBe(message);
      expect(state.entries.map((item) => item.id)).toEqual(["latest"]);
      expect(state.hasMore).toBe(true);
      const count = requests.length;
      for (let i = 0; i < 10; i++) await act(async () => state.loadMore());
      expect(requests).toHaveLength(count);
      await act(async () => {
        state.retryLoadMore();
        state.retryLoadMore();
      });
      expect(requests).toHaveLength(count + 1);
      expect(state.loadState).toBe("loadingMore");
      expect(state.errorMessage).toBeNull();
      await history([entry("older")]);
      expect(state.entries.map((item) => item.id)).toEqual(["older", "latest"]);
    },
  );

  test("分页重试成功恢复自动加载，重连清除失败状态", async () => {
    await history([entry("latest")], true);
    await act(async () => state.loadMore());
    await act(async () => requests.at(-1)!.reject(new TypeError("Offline")));
    expect(state.loadState).toBe("loadingMoreError");
    await act(async () => state.retryLoadMore());
    await history([entry("older")], true);
    expect(state.loadState).toBe("idle");
    const count = requests.length;
    await act(async () => state.loadMore());
    expect(requests).toHaveLength(count + 1);
    await act(async () =>
      requests.at(-1)!.reject(new TypeError("Offline again")),
    );
    await act(async () =>
      useWebSocket.setState({ connectionState: "disconnected" }),
    );
    await act(async () =>
      useWebSocket.setState({ connectionState: "connected" }),
    );
    expect(state.loadState).toBe("refreshing");
    expect(state.errorMessage).toBeNull();
    await history([entry("restored")], true);
    expect(state.loadState).toBe("idle");
  });

  test("首次历史加载失败仍显示整体错误", async () => {
    await act(async () =>
      requests
        .at(-1)!
        .resolve(Response.json({ error: "Read failed" }, { status: 502 })),
    );
    expect(state.loadState).toBe("error");
    expect(state.errorMessage).toBe("Read failed");
    expect(state.entries).toEqual([]);
  });
});

describe("本地发送记录", () => {
  test("文本与图片只进入占位，连续发送受限且不影响分页", async () => {
    const user = {
      type: "message",
      id: "existing",
      message: { role: "user", content: "previous" },
    };
    await history([user], true);
    const images = [{ data: "AA==", mimeType: "image/png" }];
    await act(async () => {
      expect(state.prepareSend("question", images)).toBe(true);
      expect(state.prepareSend("duplicate")).toBe(false);
    });
    expect(state.pendingUserEntry?.message?.content).toEqual([
      { type: "text", text: "question" },
      { type: "image", ...images[0] },
    ]);
    expect(state.isAwaitingReply).toBe(true);
    expect(state.entries).toEqual([user]);
    await act(async () => state.loadMore());
    expect(
      new URL(requests.at(-1)!.url, "http://localhost").searchParams.get(
        "offset",
      ),
    ).toBe("1");
  });

  test("只由当前实例的真实用户消息接替，占位 key 与等待状态保持连续", async () => {
    await act(async () => {
      state.prepareSend("question");
    });
    const placeholder = state.pendingUserEntry;
    await event(
      "message_end",
      {
        message: { role: "user", content: "other" },
      },
      "other-instance" as InstanceId,
    );
    await event("message_end", {
      message: { role: "toolResult", content: [] },
    });
    expect(state.pendingUserEntry).toBe(placeholder);
    const message = { role: "user", content: "question", timestamp: 123 };
    await event("message_end", { message });
    expect(state.pendingUserEntry).toBeNull();
    expect(
      state.entries.filter((entry) => entry.message?.role === "user"),
    ).toHaveLength(1);
    expect(state.entries.at(-1)?.message).toBe(message);
    expect(state.entries.at(-1)?.__renderKey).toBe(placeholder?.__renderKey);
    expect(state.isAwaitingReply).toBe(true);
    await act(async () => {
      expect(state.prepareSend("duplicate")).toBe(false);
    });
    await event("message_start", {
      message: { role: "assistant", content: [] },
    });
    expect(state.isAwaitingReply).toBe(false);
  });

  test("断线清除本地记录，离线拒绝发送，重连后可重新准备", async () => {
    await act(async () => {
      state.prepareSend("question");
    });
    await act(async () =>
      useWebSocket.setState({ connectionState: "disconnected" }),
    );
    expect(state.pendingUserEntry).toBeNull();
    expect(state.isAwaitingReply).toBe(false);
    await act(async () => {
      expect(state.prepareSend("offline")).toBe(false);
    });
    await act(async () =>
      useWebSocket.setState({ connectionState: "connected" }),
    );
    await history();
    await act(async () => {
      expect(state.prepareSend("next")).toBe(true);
    });
  });

  test("session 切换清除本地用户占位与等待状态", async () => {
    const instance: InstanceInfo = {
      id: instanceId,
      edgeId: "edge",
      hostname: "host",
      cwd: "/project",
      homedir: "/home",
      pid: 1,
      status: "idle",
      model: { provider: "provider", id: "model" },
      connectedAt: 0,
      lastHeartbeat: 0,
      sessionId: "session-one",
    };
    await act(async () => root.render(<Probe instance={instance} />));
    await act(async () => {
      state.prepareSend("question");
    });
    await act(async () =>
      root.render(
        <Probe instance={{ ...instance, sessionId: "session-two" }} />,
      ),
    );
    expect(state.pendingUserEntry).toBeNull();
    expect(state.isAwaitingReply).toBe(false);
    expect(state.loadState).toBe("refreshing");
  });

  test("发送错误清除本地状态，其他操作错误不清除", async () => {
    await act(async () => {
      state.prepareSend("question");
    });
    const placeholder = state.pendingUserEntry;
    await act(async () =>
      handler({
        type: "instance_error",
        payload: { instanceId, action: "set_model", message: "unavailable" },
      }),
    );
    expect(state.pendingUserEntry).toBe(placeholder);
    await act(async () =>
      handler({
        type: "instance_error",
        payload: { instanceId, action: "prompt", message: "rejected" },
      }),
    );
    expect(state.pendingUserEntry).toBeNull();
    expect(state.isAwaitingReply).toBe(false);
  });
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
    expect(
      new URL(requests.at(-1)!.url, "http://localhost").searchParams.get(
        "offset",
      ),
    ).toBe("4");
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

  test("未知历史类型保留条目数量、扩展字段与分页 offset", async () => {
    const entry = {
      type: "future_entry",
      id: "future",
      parentId: null,
      extra: true,
    };
    await history([entry], true);
    expect(state.entries[0]).toEqual(entry);
    expect(state.displayItems).toEqual([]);
    await act(async () => state.loadMore());
    expect(
      new URL(requests.at(-1)!.url, "http://localhost").searchParams.get(
        "offset",
      ),
    ).toBe("1");
  });

  test("无效历史显示加载错误，合法响应恢复对话", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      await history([null]);
      expect(state.loadState).toBe("error");
      expect(state.entries).toEqual([]);
      await act(async () =>
        useWebSocket.setState({ connectionState: "disconnected" }),
      );
      await act(async () =>
        useWebSocket.setState({ connectionState: "connected" }),
      );
      await history([
        {
          type: "message",
          id: "valid",
          message: { role: "user", content: "question" },
        },
      ]);
      expect(state.loadState).toBe("idle");
      expect(state.entries).toHaveLength(1);
    } finally {
      log.mockRestore();
    }
  });

  test("无效实时字段保持原有对话与工具状态", async () => {
    await event("message_start", { message: { role: 1, content: [] } });
    await event("message_update", null);
    await event("tool_execution_start", { toolCallId: 1 });
    await event("tool_execution_end", { toolCallId: "one", isError: "false" });
    expect(state.streamingEntry).toBeNull();
    expect(state.toolExecutions.size).toBe(0);
    expect(state.entries).toEqual([]);
  });
});
