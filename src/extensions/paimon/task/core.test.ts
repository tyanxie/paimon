import { describe, expect, test } from "bun:test";
import type {
  SessionEntry,
  SessionMessageEntry,
} from "@earendil-works/pi-coding-agent";
import type { JsonValue } from "@earendil-works/pi-ai";
import { reconstructFromBranch, type Task } from "./core";

function result(
  details: JsonValue | undefined,
  isError = false,
  toolName = "paimon_task",
): SessionMessageEntry {
  return {
    type: "message",
    id: "test",
    parentId: null,
    timestamp: "2026-01-01T00:00:00.000Z",
    message: {
      role: "toolResult",
      toolCallId: "test",
      toolName,
      content: [],
      details,
      isError,
      timestamp: 0,
    },
  };
}

const pending = [{ name: "one", status: "pending" }] satisfies Task[];
const complete = [{ name: "one", status: "complete" }] satisfies Task[];

describe("reconstructFromBranch", () => {
  test("没有任务工具结果时返回空计划", () => {
    const entries: SessionEntry[] = [
      {
        type: "custom",
        id: "custom",
        parentId: null,
        timestamp: "",
        customType: "paimon_task",
        data: { tasks: pending },
      },
      {
        type: "message",
        id: "user",
        parentId: null,
        timestamp: "",
        message: { role: "user", content: "paimon_task", timestamp: 0 },
      },
      result({ tasks: pending }, false, "task"),
    ];
    expect(reconstructFromBranch([])).toEqual([]);
    expect(reconstructFromBranch(entries)).toEqual([]);
  });

  test.each(["init", "update", "status"])(
    "恢复最后一份成功的 %s 快照",
    (action) => {
      expect(
        reconstructFromBranch([
          result({ action: "init", tasks: pending }),
          result({ action, tasks: complete }),
        ]),
      ).toEqual(complete);
    },
  );

  test("最后一份 clear 空快照覆盖旧计划", () => {
    expect(
      reconstructFromBranch([
        result({ action: "init", tasks: pending }),
        result({ action: "clear", tasks: [] }),
        result(
          { action: "update", tasks: complete, error: "no task list active" },
          true,
        ),
      ]),
    ).toEqual([]);
  });

  test("忽略其他工具及工具或 details 标记的错误结果", () => {
    expect(
      reconstructFromBranch([
        result({ tasks: pending }),
        result({ tasks: complete }, false, "bash"),
        result({ tasks: complete }, true),
        result({ tasks: complete, error: "out of range" }),
      ]),
    ).toEqual(pending);
  });

  test.each<{ details: JsonValue | undefined }>([
    { details: undefined },
    { details: null },
    { details: "invalid" },
    { details: {} },
    { details: { tasks: null } },
    { details: { tasks: {} } },
    { details: { tasks: [null] } },
    { details: { tasks: ["one"] } },
    { details: { tasks: [{ status: "pending" }] } },
    { details: { tasks: [{ name: 1, status: "pending" }] } },
    { details: { tasks: [{ name: "one" }] } },
    { details: { tasks: [{ name: "one", status: "unknown" }] } },
    { details: { tasks: [...complete, { name: "two", status: "unknown" }] } },
  ])("忽略无效快照而不恢复部分步骤：%j", ({ details }) => {
    expect(
      reconstructFromBranch([result({ tasks: pending }), result(details)]),
    ).toEqual(pending);
    expect(reconstructFromBranch([result(details)])).toEqual([]);
  });

  test("复制任务对象并保留步骤顺序，不修改或共享历史快照", () => {
    const historical = [
      { name: "one", status: "in_progress" },
      { name: "two", status: "pending" },
      { name: "three", status: "complete" },
    ] satisfies Task[];
    const snapshot = structuredClone(historical);
    const entries = [
      result({ action: "status", tasks: historical, extra: "preserved" }),
    ];
    const restored = reconstructFromBranch(entries);
    expect(restored).toEqual(snapshot);
    expect(restored).not.toBe(historical);
    expect(restored[0]).not.toBe(historical[0]);
    restored[0].status = "complete";
    restored.push({ name: "four", status: "pending" });
    expect(historical).toEqual(snapshot);
    historical[1].name = "changed";
    expect(restored[1].name).toBe("two");
  });

  test("compaction 不影响原始分支中的任务恢复", () => {
    const entries: SessionEntry[] = [
      result({ tasks: pending }),
      {
        type: "compaction",
        id: "compact",
        parentId: "test",
        timestamp: "",
        summary: "summary",
        firstKeptEntryId: "compact",
        tokensBefore: 1000,
      },
    ];
    expect(reconstructFromBranch(entries)).toEqual(pending);
  });
});
