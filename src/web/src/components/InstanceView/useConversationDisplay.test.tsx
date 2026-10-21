import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  ConversationExecution,
  ConversationItem,
  ConversationReply,
  ConversationTool,
  SessionEntry,
  ToolExecutionState,
} from "../../stores/types";
import { useConversationDisplay } from "./useConversationDisplay";
import type { InstanceStatus } from "../../../../protocol/types";

let root: Root;
let container: HTMLDivElement;
let items: ConversationItem[];
const noExecutions = new Map<string, ToolExecutionState>();
const noLiveCalls = new Set<string>();

function Probe({
  entries,
  executions,
  streaming,
  status,
  liveToolCallIds,
}: {
  entries: readonly SessionEntry[];
  executions: ReadonlyMap<string, ToolExecutionState>;
  streaming: SessionEntry | null;
  status?: InstanceStatus;
  liveToolCallIds: ReadonlySet<string>;
}) {
  items = useConversationDisplay(
    entries,
    executions,
    streaming,
    status,
    liveToolCallIds,
  );
  return null;
}

async function display(
  entries: readonly SessionEntry[],
  executions: ReadonlyMap<string, ToolExecutionState> = noExecutions,
  streaming: SessionEntry | null = null,
  status?: InstanceStatus,
  liveToolCallIds: ReadonlySet<string> = noLiveCalls,
) {
  await act(async () =>
    root.render(
      <Probe
        entries={entries}
        executions={executions}
        streaming={streaming}
        status={status}
        liveToolCallIds={liveToolCallIds}
      />,
    ),
  );
}

function message(id: string, role: string, content: unknown): SessionEntry {
  return { type: "message", id, message: { role, content } };
}

function text(value: string) {
  return { type: "text", text: value };
}

function thinking(value: string) {
  return { type: "thinking", thinking: value };
}

function call(id: string, name = "bash") {
  return { type: "toolCall", id, name, arguments: { command: id } };
}

function result(id: string, isError = false): SessionEntry {
  return {
    type: "message",
    id: `result-${id}`,
    message: {
      role: "toolResult",
      toolCallId: id,
      content: [text(`output-${id}`)],
      isError,
      durationMs: 25,
      details: { diff: "diff" },
    },
  };
}

function replies(): ConversationReply[] {
  return items.filter(
    (item): item is ConversationReply => item.type === "reply",
  );
}

function executions(reply = replies()[0]!): ConversationExecution[] {
  return reply.parts.filter(
    (part): part is ConversationExecution => part.type === "execution",
  );
}

function tools(group = executions()[0]!): ConversationTool[] {
  return group.items.filter(
    (item): item is ConversationTool => item.type === "tool",
  );
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("回复分组", () => {
  test("用户独立展示，其后的多条 assistant 组成一个回复", async () => {
    const entries = [
      message("u1", "user", "question"),
      message("a1", "assistant", [text("first")]),
      message("a2", "assistant", [text("second")]),
      message("u2", "user", "next"),
      message("a3", "assistant", [text("third")]),
    ];
    await display(entries);
    expect(items.map((item) => item.type)).toEqual([
      "user",
      "reply",
      "user",
      "reply",
    ]);
    expect(replies().map((reply) => reply.key)).toEqual([
      "reply:u1",
      "reply:u2",
    ]);
    expect(replies()[0]!.entries).toEqual(entries.slice(1, 3));
    expect(replies()[0]!.parts.map((part) => part.type)).toEqual([
      "text",
      "text",
    ]);
    expect(items[0]?.type === "user" && items[0].entry).toBe(entries[0]);
  });

  test("缺少前置用户时仍展示 assistant 和系统摘要", async () => {
    const system: SessionEntry = {
      type: "compaction",
      id: "s1",
      summary: "summary",
    };
    await display([system, message("a1", "assistant", [text("continued")])]);
    expect(items.map((item) => item.type)).toEqual(["system", "reply"]);
    expect(items[0]?.type === "system" && items[0].entry).toBe(system);
    expect(replies()[0]!.key).toBe("reply:s1");
    expect(replies()[0]!.userEntryKey).toBeUndefined();
  });

  test("连续用户消息保持独立，空 assistant 保留回复身份", async () => {
    await display([
      message("u1", "user", "one"),
      message("u2", "user", "two"),
      message("a1", "assistant", []),
    ]);
    expect(items.map((item) => item.type)).toEqual(["user", "user", "reply"]);
    expect(replies()[0]!.key).toBe("reply:u2");
    expect(replies()[0]!.parts).toHaveLength(0);
  });

  test("字符串正文与消息错误保持原始顺序和归属", async () => {
    const entry = message("a1", "assistant", "partial");
    entry.message!.stopReason = "aborted";
    entry.message!.errorMessage = "stopped";
    await display([entry]);
    const parts = replies()[0]!.parts;
    expect(parts.map((part) => part.type)).toEqual(["text", "error"]);
    expect(parts[0]?.type === "text" && parts[0].content).toBe("partial");
    expect(parts[1]?.type === "error" && parts[1].stopReason).toBe("aborted");
    expect(parts[1]?.type === "error" && parts[1].source.entry).toBe(entry);
  });

  test("无正文的失败消息保留错误", async () => {
    const entry = message("a1", "assistant", []);
    entry.message!.stopReason = "error";
    entry.message!.errorMessage = "API failure";
    await display([entry]);
    expect(replies()[0]!.parts[0]?.type).toBe("error");
  });
});

describe("连续执行区域", () => {
  test("工具跨 assistant 和 toolResult 合并，正文分隔后续执行组", async () => {
    await display([
      message("u1", "user", "question"),
      message("a1", "assistant", [thinking("plan"), call("one")]),
      result("one"),
      message("a2", "assistant", [call("two"), text("body A"), call("three")]),
      result("two"),
      result("three"),
      message("a3", "assistant", [text("body B")]),
    ]);
    const reply = replies()[0]!;
    expect(reply.parts.map((part) => part.type)).toEqual([
      "execution",
      "text",
      "execution",
      "text",
    ]);
    expect(executions()[0]!.items.map((item) => item.type)).toEqual([
      "thinking",
      "tool",
      "tool",
    ]);
    expect(
      executions().map((group) => tools(group).map((tool) => tool.toolCallId)),
    ).toEqual([["one", "two"], ["three"]]);
    expect(executions()[0]!.counts.completed).toBe(2);
    expect(executions()[1]!.counts.completed).toBe(1);
  });

  test("系统事件保留摘要并分隔工具组，结果仍匹配原工具", async () => {
    for (const type of ["compaction", "branch_summary"]) {
      const system: SessionEntry = { type, id: "s1", summary: "full summary" };
      await display([
        message("a1", "assistant", [call("one")]),
        system,
        result("one"),
        message("a2", "assistant", [call("two")]),
      ]);
      expect(items.map((item) => item.type)).toEqual([
        "reply",
        "system",
        "reply",
      ]);
      expect(replies().map((reply) => reply.key)).toEqual([
        "reply:a1",
        "reply:s1",
      ]);
      expect(items[1]?.type === "system" && items[1].entry).toBe(system);
      expect(replies()[0]!.parts.map((part) => part.type)).toEqual([
        "execution",
      ]);
      expect(replies()[1]!.parts.map((part) => part.type)).toEqual([
        "execution",
      ]);
      expect(replies()[0]!.entries).not.toContain(system);
      expect(tools()[0]!.state.status).toBe("completed");
    }
  });

  test("用户消息分隔执行组", async () => {
    await display([
      message("a1", "assistant", [call("one")]),
      message("u1", "user", "next"),
      message("a2", "assistant", [call("two")]),
    ]);
    expect(replies()).toHaveLength(2);
    expect(executions(replies()[0])).toHaveLength(1);
    expect(
      tools(executions(replies()[1])[0]).map((tool) => tool.toolCallId),
    ).toEqual(["two"]);
  });

  test("thinking 保留顺序并且不计入工具数量", async () => {
    await display([
      message("a1", "assistant", [
        thinking("first"),
        call("one"),
        thinking("second"),
      ]),
    ]);
    const group = executions()[0]!;
    expect(group.items.map((item) => item.type)).toEqual([
      "thinking",
      "tool",
      "thinking",
    ]);
    expect(group.counts.unknown).toBe(1);
    expect(
      Object.values(group.counts).reduce((sum, count) => sum + count, 0),
    ).toBe(1);
  });

  test("空 thinking 保留原始数据，补充文字后保持执行区域身份", async () => {
    const blocks = [
      thinking(""),
      thinking(" \n\t"),
      { type: "thinking", thinking: "", thinkingSignature: "signature" },
    ];
    const entry = message("a1", "assistant", blocks);
    await display([entry], noExecutions, entry);
    expect(executions()).toHaveLength(0);
    expect(replies()[0]!.entries[0]).toBe(entry);
    const withTool = {
      ...entry,
      message: { role: "assistant", content: [...blocks, call("one")] },
    };
    await display([withTool], noExecutions, withTool);
    expect(executions()[0]!.items.map((item) => item.type)).toEqual(["tool"]);
    const key = executions()[0]!.key;
    const updated = {
      ...entry,
      message: {
        role: "assistant",
        content: [thinking("plan"), ...blocks.slice(1), call("one")],
      },
    };
    await display([updated], noExecutions, updated);
    expect(executions()[0]!.key).toBe(key);
    expect(executions()[0]!.items.map((item) => item.type)).toEqual([
      "thinking",
      "tool",
    ]);
    expect(entry.message!.content).toBe(blocks);
  });

  test("空白 text 保留连续执行关系，未知内容保持安全", async () => {
    await display([
      message("a1", "assistant", [
        call("one"),
        text(" \n"),
        null,
        { type: "future" },
        call("two"),
      ]),
      { type: "model_change", id: "m1" },
      message("a2", "assistant", [call("three")]),
    ]);
    expect(executions()).toHaveLength(1);
    expect(tools().map((tool) => tool.toolCallId)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  test("重复 toolCallId 保持单个工具身份与数量", async () => {
    await display([
      message("a1", "assistant", [call("one"), call("one")]),
      message("a2", "assistant", [call("one"), call("two")]),
    ]);
    expect(tools().map((tool) => tool.toolCallId)).toEqual(["one", "two"]);
    expect(executions()[0]!.counts.unknown).toBe(2);
  });
});

describe("工具状态与结果", () => {
  test("跨用户消息返回的结果仍归属原回复", async () => {
    const first = message("a1", "assistant", [call("one")]);
    const second = message("a2", "assistant", [text("next reply")]);
    const final = result("one");
    await display([first, message("u1", "user", "next"), second, final]);
    expect(replies()[0]!.entries).toEqual([first, final]);
    expect(replies()[1]!.entries).toEqual([second]);
    expect(tools()[0]!.state.status).toBe("completed");
  });

  test("并发工具分别汇总运行、完成、失败、终止与未知状态", async () => {
    const aborted = message("a2", "assistant", [call("stopped")]);
    aborted.message!.stopReason = "aborted";
    const live = new Map<string, ToolExecutionState>([
      [
        "running",
        {
          status: "running",
          startedAt: 10,
          partialResult: { content: [text("partial")] },
        },
      ],
      [
        "done",
        {
          status: "completed",
          result: { content: [] },
          isError: false,
          durationMs: 15,
        },
      ],
      [
        "failed",
        {
          status: "completed",
          result: { content: [] },
          isError: true,
          durationMs: 20,
        },
      ],
    ]);
    await display(
      [
        aborted,
        message("a1", "assistant", [
          call("running"),
          call("done"),
          call("failed"),
          call("missing"),
          call("pending"),
        ]),
      ],
      live,
      null,
      "streaming",
      new Set(["pending"]),
    );
    expect(executions()[0]!.counts).toEqual({
      pending: 1,
      running: 1,
      completed: 1,
      error: 1,
      aborted: 1,
      unknown: 1,
    });
    const running = tools().find((tool) => tool.toolCallId === "running")!;
    expect(running.state.status).toBe("running");
    if (running.state.status !== "running")
      throw new Error("Expected running tool");
    const runningExecution = live.get("running");
    if (runningExecution?.status !== "running")
      throw new Error("Expected running snapshot");
    expect(running.state.execution).toBe(runningExecution);
    const done = tools().find((tool) => tool.toolCallId === "done")!;
    expect(done.state.status === "completed" && done.state.durationMs).toBe(15);
    await display(
      [message("a1", "assistant", [call("pending")])],
      noExecutions,
      null,
      "idle",
      new Set(["pending"]),
    );
    expect(tools()[0]!.state).toEqual({ status: "unknown" });
  });

  test("历史结果优先于实时状态，保留输出、details 与 durationMs", async () => {
    const final = result("one", true);
    const live = new Map<string, ToolExecutionState>([
      [
        "one",
        { status: "running", partialResult: { content: [text("partial")] } },
      ],
    ]);
    await display([message("a1", "assistant", [call("one")]), final], live);
    const state = tools()[0]!.state;
    expect(state.status).toBe("error");
    if (state.status !== "error") throw new Error("Expected failed tool");
    expect(state.result).toBe(final.message);
    expect(state.resultEntry).toBe(final);
    expect(state.durationMs).toBe(25);
  });

  test("完成事件交接到历史结果时保留工具和汇总 key", async () => {
    const entries = [message("a1", "assistant", [call("one")])];
    await display(
      entries,
      new Map([
        [
          "one",
          {
            status: "completed",
            result: { content: [] },
            isError: false,
            durationMs: 25,
          },
        ],
      ]),
    );
    const executionKey = executions()[0]!.key;
    const toolKey = tools()[0]!.key;
    await display([...entries, result("one")]);
    expect(executions()[0]!.key).toBe(executionKey);
    expect(tools()[0]!.key).toBe(toolKey);
    expect(executions()[0]!.counts.completed).toBe(1);
  });

  test("终止消息结束未完成工具，已完成工具保留结果", async () => {
    const entry = message("a1", "assistant", [call("one"), call("two")]);
    entry.message!.stopReason = "error";
    await display(
      [entry, result("two")],
      new Map([["one", { status: "running", startedAt: 10 }]]),
    );
    expect(tools().map((tool) => tool.state.status)).toEqual([
      "aborted",
      "completed",
    ]);
  });

  test("后续 assistant 终止时停止原回复内的未完成工具", async () => {
    const aborted = message("a2", "assistant", []);
    aborted.message!.stopReason = "aborted";
    await display(
      [
        message("a1", "assistant", [call("one"), call("two"), call("pending")]),
        result("two"),
        aborted,
      ],
      new Map([["one", { status: "running", startedAt: 10 }]]),
      null,
      "streaming",
      new Set(["pending"]),
    );
    expect(tools().map((tool) => tool.state.status)).toEqual([
      "aborted",
      "completed",
      "aborted",
    ]);
    expect(executions()[0]!.counts.running).toBe(0);
    expect(executions()[0]!.counts.pending).toBe(0);
    expect(executions()[0]!.counts.aborted).toBe(2);
  });

  test("缺少结果与执行事件的历史工具保持未知，不构造耗时", async () => {
    await display(
      [message("a1", "assistant", [call("one")])],
      noExecutions,
      null,
      "streaming",
    );
    expect(tools()[0]!.state).toEqual({ status: "unknown" });
  });
});

describe("稳定身份与原始数据", () => {
  test("流式正文增长和最终消息转换保持所有 key", async () => {
    const user = message("u1", "user", "question");
    const entry: SessionEntry = {
      type: "message",
      __renderKey: "live-key",
      timestamp: "2026-01-01T00:00:00Z",
      message: {
        role: "assistant",
        content: [thinking("plan"), call("one"), text("part")],
      },
    };
    await display([user, entry], noExecutions, entry);
    const replyKey = replies()[0]!.key;
    const partKeys = replies()[0]!.parts.map((part) => part.key);
    const toolKey = tools()[0]!.key;
    const updated = {
      ...entry,
      message: {
        ...entry.message!,
        content: [thinking("plan"), call("one"), text("complete")],
      },
    };
    await display([user, updated], noExecutions, updated);
    expect(replies()[0]!.parts.map((part) => part.key)).toEqual(partKeys);
    const last = replies()[0]!.parts.at(-1)!;
    expect(last.type === "text" && last.source.streaming).toBe(true);
    await display([user, updated]);
    expect(replies()[0]!.key).toBe(replyKey);
    expect(replies()[0]!.parts.map((part) => part.key)).toEqual(partKeys);
    expect(tools()[0]!.key).toBe(toolKey);
    const completed = replies()[0]!.parts.at(-1)!;
    expect(completed.type === "text" && completed.source.streaming).toBe(false);
  });

  test("历史 prepend 保留现有回复身份和内部块身份", async () => {
    const current = [
      message("u2", "user", "current"),
      message("a2", "assistant", [call("two"), text("body")]),
    ];
    await display(current);
    const keys = [
      replies()[0]!.key,
      ...replies()[0]!.parts.map((part) => part.key),
    ];
    await display([
      message("u1", "user", "earlier"),
      message("a1", "assistant", [text("old")]),
      ...current,
    ]);
    expect([
      replies()[1]!.key,
      ...replies()[1]!.parts.map((part) => part.key),
    ]).toEqual(keys);
  });

  test("保留原始 entry、图片、时间、参数和数组长度", async () => {
    const image = { type: "image", data: "base64", mimeType: "image/png" };
    const user = message("u1", "user", [text("question"), image]);
    const assistant = message("a1", "assistant", [
      thinking("plan"),
      call("one"),
      text("body"),
    ]);
    assistant.timestamp = "2026-01-01T00:00:00Z";
    const final = result("one");
    const entries = Object.freeze([
      Object.freeze(user),
      Object.freeze(assistant),
      Object.freeze(final),
    ]);
    const snapshot = JSON.stringify(entries);
    await display(entries);
    expect(JSON.stringify(entries)).toBe(snapshot);
    expect(entries).toHaveLength(3);
    expect(replies()[0]!.entries).toEqual([assistant, final]);
    expect(tools()[0]!.source.entry).toBe(assistant);
    expect(tools()[0]!.source.entry.timestamp).toBe(assistant.timestamp);
    const blocks = assistant.message!.content as ReturnType<typeof call>[];
    expect(tools()[0]!.args).toBe(blocks[1]!.arguments);
    expect(items[0]?.type === "user" && items[0].entry.message!.content).toBe(
      user.message!.content,
    );
  });

  test("相同输入复用展示模型，对话重置后清空分组", async () => {
    const entries = [message("a1", "assistant", [text("body")])];
    await display(entries);
    const previous = items;
    await display(entries);
    expect(items).toBe(previous);
    await display([]);
    expect(items).toEqual([]);
  });
});
