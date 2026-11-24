import { describe, expect, test } from "bun:test";
import {
  SessionManager,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import {
  validateToolArguments,
  type JsonRepresentation,
} from "@earendil-works/pi-ai";
import { Compile } from "typebox/compile";
import { registerTaskTool } from "./index";
import type { Task, TaskInit, TaskUpdate, TaskTrackerDetails } from "./core";

function appendResult(
  session: SessionManager,
  details: JsonRepresentation<TaskTrackerDetails>,
): string {
  return session.appendMessage({
    role: "toolResult",
    toolCallId: "test",
    toolName: "paimon_task",
    content: [],
    details,
    isError: details.error !== undefined,
    timestamp: Date.now(),
  });
}

type Input = JsonRepresentation<{
  action: "init" | "update" | "status" | "clear";
  tasks?: TaskInit[];
  updates?: TaskUpdate[];
}>;
type Tool = Pick<
  ToolDefinition,
  "name" | "description" | "parameters" | "executionMode"
> & {
  execute: (
    id: string,
    input: Input,
    signal: AbortSignal,
    update: undefined,
    ctx: ExtensionContext,
  ) => Promise<{
    content: { type: "text"; text: string }[];
    details: TaskTrackerDetails;
    isError?: boolean;
  }>;
};
function harness(
  mode: "tui" | "rpc" = "rpc",
  session = SessionManager.inMemory(),
) {
  let tool: Tool | undefined;
  let published = 0;
  const snapshots: Task[][] = [];
  const widgets: unknown[][] = [];
  const handlers = new Map<
    string,
    (event: unknown, ctx: ExtensionContext) => void
  >();
  // 仅模拟本工具消费的 Pi API，不初始化真实 Extension 或连接
  const pi = {
    on: (
      event: string,
      handler: (event: unknown, ctx: ExtensionContext) => void,
    ) => handlers.set(event, handler),
    registerTool: (value: Tool) => {
      tool = value;
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    mode,
    get sessionManager() {
      return session;
    },
    ui: { setWidget: (...args: unknown[]) => widgets.push(args) },
  } as unknown as ExtensionContext;
  const tracker = registerTaskTool(pi, () => {
    published++;
    snapshots.push(tracker.getTasks());
  });
  return {
    tracker,
    widgets,
    snapshots,
    useSession(next: SessionManager) {
      session = next;
    },
    emit(event: "session_start" | "session_tree") {
      const handler = handlers.get(event);
      if (!handler) throw new Error("Missing lifecycle handler");
      handler({}, ctx);
    },
    get published() {
      return published;
    },
    get tool() {
      if (!tool) throw new Error("Tool not registered");
      return tool;
    },
    validate(input: Input): Input {
      return validateToolArguments(this.tool, {
        type: "toolCall",
        id: "test",
        name: this.tool.name,
        arguments: input,
      });
    },
    async call(input: Input) {
      const result = await this.tool.execute(
        "test",
        this.validate(input),
        new AbortController().signal,
        undefined,
        ctx,
      );
      appendResult(session, result.details);
      return result;
    },
  };
}

describe("paimon_task", () => {
  test.each<{ name: string; input: Record<string, unknown> }>([
    { name: "字符串任务", input: { action: "init", tasks: ["one"] } },
    {
      name: "旧顶层更新参数",
      input: { action: "update", index: 0, status: "complete" },
    },
    {
      name: "初始化任务缺少名称",
      input: { action: "init", tasks: [{ status: "pending" }] },
    },
    {
      name: "非法初始状态",
      input: { action: "init", tasks: [{ name: "one", status: "unknown" }] },
    },
    {
      name: "非法更新状态",
      input: { action: "update", updates: [{ index: 0, status: "unknown" }] },
    },
    {
      name: "更新缺少状态",
      input: { action: "update", updates: [{ index: 0 }] },
    },
    {
      name: "负数索引",
      input: { action: "update", updates: [{ index: -1, status: "complete" }] },
    },
    {
      name: "非整数索引",
      input: {
        action: "update",
        updates: [{ index: 0.5, status: "complete" }],
      },
    },
  ])("参数 schema 不接受 $name", ({ input }) => {
    const h = harness();
    expect(Compile(h.tool.parameters).Check(input)).toBe(false);
  });
  test("顺序注册，初始化替换计划，批量更新与查询后清空", async () => {
    const h = harness();
    expect(h.tool.name).toBe("paimon_task");
    expect(h.tool.executionMode).toBe("sequential");
    const initial = await h.call({
      action: "init",
      tasks: [
        { name: "one", status: "in_progress" },
        { name: "two" },
        { name: "three", status: "complete" },
      ],
    });
    expect(initial.details.tasks).toEqual([
      { name: "one", status: "in_progress" },
      { name: "two", status: "pending" },
      { name: "three", status: "complete" },
    ]);
    for (const name of ["one", "two", "three"]) {
      expect(initial.content[0].text).toContain(name);
    }
    const updated = await h.call({
      action: "update",
      updates: [
        { index: 0, status: "complete" },
        { index: 1, status: "in_progress" },
      ],
    });
    const expected: Task[] = [
      { name: "one", status: "complete" },
      { name: "two", status: "in_progress" },
      { name: "three", status: "complete" },
    ];
    expect(updated.isError).toBe(false);
    expect(updated.details.tasks).toEqual(expected);
    expect(h.published).toBe(2);
    expect(h.snapshots).toEqual([initial.details.tasks, expected]);
    expect(updated.content[0].text).toContain("[0] one -> complete");
    expect(updated.content[0].text).toContain("[1] two -> in_progress");
    expect(updated.content[0].text).toContain("2/3 complete");
    expect(updated.content[0].text).not.toContain("three");
    const status = await h.call({ action: "status" });
    expect(status.details.tasks).toEqual(expected);
    expect(status.content[0].text).toContain("three");
    await h.call({ action: "init", tasks: [{ name: "replacement" }] });
    expect(h.tracker.getTasks()).toEqual([
      { name: "replacement", status: "pending" },
    ]);
    await h.call({ action: "clear" });
    expect(h.tracker.getTasks()).toEqual([]);
    expect(h.published).toBe(5);
  });
  test("错误和查询也发布快照，批量更新失败不破坏现有计划", async () => {
    const session = SessionManager.inMemory();
    const h = harness("rpc", session);
    const noPlan = await h.call({
      action: "update",
      updates: [{ index: 0, status: "complete" }],
    });
    expect(noPlan.details.error).toBe("no task list active");
    expect(noPlan.isError).toBe(true);
    const initial = await h.call({
      action: "init",
      tasks: [{ name: "one", status: "in_progress" }, { name: "two" }],
    });
    const invalid: { input: Input; error: string }[] = [
      { input: { action: "init" }, error: "tasks required" },
      { input: { action: "init", tasks: [] }, error: "tasks required" },
      { input: { action: "update" }, error: "updates required" },
      { input: { action: "update", updates: [] }, error: "updates required" },
      {
        input: {
          action: "update",
          updates: [
            { index: 0, status: "complete" },
            { index: 2, status: "in_progress" },
          ],
        },
        error: "index 2 out of range",
      },
      {
        input: {
          action: "update",
          updates: [
            { index: 0, status: "complete" },
            { index: 0, status: "pending" },
          ],
        },
        error: "duplicate index 0",
      },
    ];
    for (const { input, error } of invalid) {
      const published = h.published;
      const result = await h.call(input);
      expect(result.details.error).toBe(error);
      expect(result.isError).toBe(true);
      expect(result.details.tasks).toEqual(initial.details.tasks);
      expect(h.tracker.getTasks()).toEqual(initial.details.tasks);
      expect(h.snapshots.at(-1)).toEqual(initial.details.tasks);
      expect(h.published).toBe(published + 1);
    }
    const restored = harness("rpc", session);
    restored.emit("session_start");
    expect(restored.tracker.getTasks()).toEqual(initial.details.tasks);
    await h.call({ action: "status" });
    expect(h.published).toBe(3 + invalid.length);
  });
  test("成功操作不标记为错误，包括错误后的恢复和相同状态更新", async () => {
    const h = harness();
    await h.call({ action: "init" });
    for (const input of [
      { action: "init", tasks: [{ name: "one" }] },
      { action: "update", updates: [{ index: 0, status: "pending" }] },
      { action: "update", updates: [{ index: 0, status: "complete" }] },
      { action: "status" },
      { action: "clear" },
      { action: "clear" },
    ] satisfies Input[]) {
      const result = await h.call(input);
      expect(result.isError).toBe(false);
      expect(result.details.error).toBeUndefined();
    }
  });
  test("读取快照和工具结果不允许外部修改内部计划", async () => {
    const h = harness();
    const result = await h.call({ action: "init", tasks: [{ name: "one" }] });
    result.details.tasks[0].name = "changed";
    const snapshot = h.tracker.getTasks();
    snapshot[0].status = "complete";
    snapshot.push({ name: "extra", status: "pending" });
    expect(h.tracker.getTasks()).toEqual([{ name: "one", status: "pending" }]);
  });
  test.each(["session_start", "session_tree"] as const)(
    "%s 目标分支没有任务记录时清空计划并移除 TUI widget",
    async (event) => {
      const h = harness("tui");
      await h.call({ action: "init", tasks: [{ name: "one" }] });
      expect(h.widgets[0][0]).toBe("paimon:task");
      expect(typeof h.widgets[0][1]).toBe("function");
      h.useSession(SessionManager.inMemory());
      h.emit(event);
      expect(h.tracker.getTasks()).toEqual([]);
      expect(h.widgets.at(-1)).toEqual(["paimon:task", undefined]);
      expect(h.snapshots.at(-1)).toEqual([]);
      expect(h.published).toBe(2);
    },
  );
  test("重新加载 Extension 后恢复计划，更新时不修改历史快照", async () => {
    const session = SessionManager.inMemory();
    const original = harness("rpc", session);
    await original.call({
      action: "init",
      tasks: [{ name: "one" }, { name: "two" }],
    });
    const latest = await original.call({
      action: "update",
      updates: [
        { index: 0, status: "in_progress" },
        { index: 1, status: "complete" },
      ],
    });

    const restored = harness("rpc", session);
    restored.emit("session_start");
    expect(restored.tracker.getTasks()).toEqual(latest.details.tasks);
    expect(restored.snapshots).toEqual([latest.details.tasks]);
    expect(restored.widgets).toEqual([]);
    await restored.call({
      action: "update",
      updates: [{ index: 0, status: "complete" }],
    });
    expect(latest.details.tasks[0].status).toBe("in_progress");
    expect(restored.tracker.getTasks()[0].status).toBe("complete");
  });
  test("session 来回切换时分别恢复各自计划并同步 TUI 和快照", async () => {
    const first = SessionManager.inMemory();
    const second = SessionManager.inMemory();
    const h = harness("tui", first);
    await h.call({ action: "init", tasks: [{ name: "first" }] });
    await h.call({
      action: "update",
      updates: [{ index: 0, status: "in_progress" }],
    });
    h.useSession(second);
    h.emit("session_start");
    expect(h.tracker.getTasks()).toEqual([]);
    await h.call({ action: "init", tasks: [{ name: "second" }] });
    await h.call({
      action: "update",
      updates: [{ index: 0, status: "complete" }],
    });

    for (const [session, expected] of [
      [first, [{ name: "first", status: "in_progress" }]],
      [second, [{ name: "second", status: "complete" }]],
    ] satisfies [SessionManager, Task[]][]) {
      h.useSession(session);
      h.emit("session_start");
      expect(h.tracker.getTasks()).toEqual(expected);
      expect(h.snapshots.at(-1)).toEqual(expected);
      expect(h.widgets.at(-1)?.[0]).toBe("paimon:task");
      expect(typeof h.widgets.at(-1)?.[1]).toBe("function");
    }
  });
  test("session_tree 只恢复当前分支，包括 clear 和回到清空前的位置", async () => {
    const session = SessionManager.inMemory();
    const root = appendResult(session, {
      action: "init",
      tasks: [{ name: "one", status: "pending" }],
    });
    const h = harness("tui", session);
    h.emit("session_start");
    await h.call({
      action: "update",
      updates: [{ index: 0, status: "complete" }],
    });
    const completed = session.getLeafId()!;
    session.branch(root);
    h.emit("session_tree");
    await h.call({ action: "clear" });
    const cleared = session.getLeafId()!;

    for (const [leaf, expected] of [
      [completed, [{ name: "one", status: "complete" }]],
      [cleared, []],
      [root, [{ name: "one", status: "pending" }]],
    ] satisfies [string, Task[]][]) {
      session.branch(leaf);
      h.emit("session_tree");
      expect(h.tracker.getTasks()).toEqual(expected);
      expect(h.snapshots.at(-1)).toEqual(expected);
      expect(typeof h.widgets.at(-1)?.[1]).toBe(
        expected.length > 0 ? "function" : "undefined",
      );
    }
  });
  test("重新打开已 clear 的 session 不恢复旧计划", async () => {
    const session = SessionManager.inMemory();
    const original = harness("rpc", session);
    await original.call({ action: "init", tasks: [{ name: "one" }] });
    await original.call({ action: "clear" });
    const restored = harness("rpc", session);
    restored.emit("session_start");
    expect(restored.tracker.getTasks()).toEqual([]);
    expect(restored.snapshots).toEqual([[]]);
  });
});
