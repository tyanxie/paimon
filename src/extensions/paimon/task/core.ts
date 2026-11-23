/**
 * Task Tracker 核心逻辑
 *
 * 纯函数实现，不依赖 Pi API
 * 支持 init / update / status / clear 四种操作
 */

import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import type { Task, TaskStatus } from "../../../protocol/types";

export type { Task, TaskStatus } from "../../../protocol/types";

export interface TaskTrackerDetails {
  action: "init" | "update" | "status" | "clear";
  tasks: Task[];
  error?: string;
}

export interface ActionResult {
  text: string;
  tasks: Task[];
  error?: string;
}

// 操作处理

export function handleInit(taskNames: string[] | undefined): ActionResult {
  if (!taskNames || taskNames.length === 0) {
    return {
      text: "Error: tasks array required for init",
      tasks: [],
      error: "tasks required",
    };
  }
  const tasks: Task[] = taskNames.map((name) => ({
    name,
    status: "pending" as TaskStatus,
  }));
  return {
    text: `Plan initialized with ${tasks.length} tasks.\n${formatStatus(tasks)}`,
    tasks,
  };
}

export function handleUpdate(
  tasks: Task[],
  index: number | undefined,
  status: TaskStatus | undefined,
): ActionResult {
  if (index === undefined || !status) {
    return {
      text: "Error: index and status required for update",
      tasks: [...tasks],
      error: "index and status required",
    };
  }
  if (tasks.length === 0) {
    return {
      text: "Error: no task list active. Use init first.",
      tasks: [],
      error: "no task list active",
    };
  }
  if (index < 0 || index >= tasks.length) {
    return {
      text: `Error: index ${index} out of range (0-${tasks.length - 1})`,
      tasks: [...tasks],
      error: `index ${index} out of range`,
    };
  }
  const updated = tasks.map((t, i) =>
    i === index ? { ...t, status } : { ...t },
  );
  return {
    text: `Task ${index} "${updated[index].name}" -> ${status}\n${formatStatus(updated)}`,
    tasks: updated,
  };
}

export function handleStatus(tasks: Task[]): ActionResult {
  return {
    text: formatStatus(tasks),
    tasks: [...tasks],
  };
}

export function handleClear(tasks: Task[]): ActionResult {
  const count = tasks.length;
  return {
    text:
      count > 0
        ? `Task list cleared (${count} tasks removed).`
        : "No task list was active.",
    tasks: [],
  };
}

// 从当前分支的最后一份有效成功快照恢复，不消费其他分支或模型上下文
export function reconstructFromBranch(
  entries: readonly SessionEntry[],
): Task[] {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (
      message.role !== "toolResult" ||
      message.toolName !== "paimon_task" ||
      message.isError
    )
      continue;

    const details: unknown = message.details;
    if (
      typeof details !== "object" ||
      details === null ||
      ("error" in details && details.error !== undefined) ||
      !("tasks" in details)
    )
      continue;
    const tasks = readTaskSnapshot(details.tasks);
    if (tasks !== undefined) return tasks;
  }
  return [];
}

// 历史 details 没有类型保证，整份快照校验通过后复制，保持步骤 index 和历史对象不变
function readTaskSnapshot(value: unknown): Task[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tasks: Task[] = [];
  for (const task of value) {
    if (
      typeof task !== "object" ||
      task === null ||
      !("name" in task) ||
      typeof task.name !== "string" ||
      !("status" in task) ||
      (task.status !== "pending" &&
        task.status !== "in_progress" &&
        task.status !== "complete")
    )
      return undefined;
    tasks.push({ name: task.name, status: task.status });
  }
  return tasks;
}

// 格式化

export function formatStatus(tasks: Task[]): string {
  if (tasks.length === 0) return "No task list active.";

  const complete = tasks.filter((t) => t.status === "complete").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const pending = tasks.filter((t) => t.status === "pending").length;

  const lines: string[] = [];
  lines.push(
    `Tasks: ${complete}/${tasks.length} complete (${inProgress} in progress, ${pending} pending)`,
  );
  lines.push("");
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const icon =
      t.status === "complete"
        ? "\u2713"
        : t.status === "in_progress"
          ? "\u2192"
          : "\u25CB";
    lines.push(`  ${icon} [${i}] ${t.name}`);
  }
  return lines.join("\n");
}
