import { describe, expect, test } from "bun:test";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { registerTaskTool } from "./index";
import type { TaskStatus, TaskTrackerDetails } from "./core";

type Input = {
  action: "init" | "update" | "status" | "clear";
  tasks?: string[];
  index?: number;
  status?: TaskStatus;
};
type Tool = {
  name: string;
  executionMode?: string;
  execute: (
    id: string,
    input: Input,
    signal: AbortSignal,
    update: undefined,
    ctx: ExtensionContext,
  ) => Promise<{ details: TaskTrackerDetails; isError?: boolean }>;
};
function harness(mode: "tui" | "rpc" = "rpc") {
  let tool: Tool | undefined;
  let published = 0;
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
    ui: { setWidget: (...args: unknown[]) => widgets.push(args) },
  } as unknown as ExtensionContext;
  const tracker = registerTaskTool(pi, () => {
    published++;
  });
  return {
    tracker,
    handlers,
    ctx,
    widgets,
    get published() {
      return published;
    },
    get tool() {
      if (!tool) throw new Error("Tool not registered");
      return tool;
    },
    async call(input: Input) {
      return this.tool.execute(
        "test",
        input,
        new AbortController().signal,
        undefined,
        ctx,
      );
    },
  };
}

describe("paimon_task", () => {
  test("顺序注册，初始化替换计划，更新与查询后清空", async () => {
    const h = harness();
    expect(h.tool.name).toBe("paimon_task");
    expect(h.tool.executionMode).toBe("sequential");
    await h.call({ action: "init", tasks: ["one", "two"] });
    expect(h.tracker.getTasks().map((t) => t.status)).toEqual([
      "pending",
      "pending",
    ]);
    await h.call({ action: "update", index: 0, status: "in_progress" });
    await h.call({ action: "update", index: 1, status: "complete" });
    expect((await h.call({ action: "status" })).details.tasks).toEqual([
      { name: "one", status: "in_progress" },
      { name: "two", status: "complete" },
    ]);
    await h.call({ action: "init", tasks: ["replacement"] });
    expect(h.tracker.getTasks()).toEqual([
      { name: "replacement", status: "pending" },
    ]);
    await h.call({ action: "clear" });
    expect(h.tracker.getTasks()).toEqual([]);
    expect(h.published).toBe(6);
  });
  test("错误和查询也发布快照，错误不破坏现有计划", async () => {
    const h = harness();
    const noPlan = await h.call({
      action: "update",
      index: 0,
      status: "complete",
    });
    expect(noPlan.details.error).toBeDefined();
    expect(noPlan.isError).toBe(true);
    await h.call({ action: "init", tasks: ["one"] });
    for (const input of [
      { action: "init" },
      { action: "init", tasks: [] },
      { action: "update" },
      { action: "update", index: 3, status: "complete" },
    ] satisfies Input[]) {
      const result = await h.call(input);
      expect(result.details.error).toBeDefined();
      expect(result.isError).toBe(true);
      expect(result.details.tasks).toEqual([
        { name: "one", status: "pending" },
      ]);
    }
    await h.call({ action: "status" });
    expect(h.published).toBe(7);
  });
  test("成功操作不标记为错误，包括错误后的恢复", async () => {
    const h = harness();
    await h.call({ action: "init" });
    for (const input of [
      { action: "init", tasks: ["one"] },
      { action: "update", index: 0, status: "complete" },
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
    const result = await h.call({ action: "init", tasks: ["one"] });
    result.details.tasks[0].name = "changed";
    const snapshot = h.tracker.getTasks();
    snapshot[0].status = "complete";
    snapshot.push({ name: "extra", status: "pending" });
    expect(h.tracker.getTasks()).toEqual([{ name: "one", status: "pending" }]);
  });
  test.each(["session_start", "session_tree"])(
    "%s 清空计划并移除 TUI widget",
    async (event) => {
      const h = harness("tui");
      await h.call({ action: "init", tasks: ["one"] });
      expect(h.widgets[0][0]).toBe("paimon:task");
      expect(typeof h.widgets[0][1]).toBe("function");
      const handler = h.handlers.get(event);
      if (!handler) throw new Error("Missing lifecycle handler");
      handler({}, h.ctx);
      expect(h.tracker.getTasks()).toEqual([]);
      expect(h.widgets.at(-1)).toEqual(["paimon:task", undefined]);
      expect(h.published).toBe(2);
    },
  );
});
