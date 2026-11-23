/**
 * Task Tracker Extension
 *
 * 注册 paimon_task 供 LLM 调用，当前计划从 session 分支的工具结果恢复
 * 在 TUI widget 中展示任务列表和进度，并同步给 Paimon
 *
 * 操作:
 *   init   — 初始化任务列表
 *   update — 更新单个任务状态
 *   status — 查看当前进度
 *   clear  — 清除任务列表
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  type Task,
  type TaskStatus,
  type TaskTrackerDetails,
  handleInit,
  handleUpdate,
  handleStatus,
  handleClear,
  reconstructFromBranch,
} from "./core.js";

const TaskTrackerParams = Type.Object({
  action: Type.Union(
    [
      Type.Literal("init"),
      Type.Literal("update"),
      Type.Literal("status"),
      Type.Literal("clear"),
    ],
    { description: "Action to perform" },
  ),
  tasks: Type.Optional(
    Type.Array(Type.String(), {
      description: "Task names (for init)",
    }),
  ),
  index: Type.Optional(
    Type.Integer({
      minimum: 0,
      description: "Task index, 0-based (for update)",
    }),
  ),
  status: Type.Optional(
    Type.Union(
      [
        Type.Literal("pending"),
        Type.Literal("in_progress"),
        Type.Literal("complete"),
      ],
      { description: "New status (for update)" },
    ),
  ),
});

interface TaskTrackerInput {
  action: "init" | "update" | "status" | "clear";
  tasks?: string[];
  index?: number;
  status?: TaskStatus;
}

/** 渲染 widget 文本（带主题颜色，展示完整任务列表） */
function renderWidgetText(tasks: Task[], theme: Theme): string {
  if (tasks.length === 0) return "";

  const complete = tasks.filter((t) => t.status === "complete").length;
  const lines: string[] = [];
  lines.push(theme.fg("muted", `Tasks (${complete}/${tasks.length})`));
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const icon =
      t.status === "complete"
        ? theme.fg("success", "\u2713")
        : t.status === "in_progress"
          ? theme.fg("warning", "\u2192")
          : theme.fg("dim", "\u25CB");
    lines.push(`  ${icon} ${t.name}`);
  }
  return lines.join("\n");
}

export function registerTaskTool(pi: ExtensionAPI, onChange: () => void) {
  let tasks: Task[] = [];

  /** 工具结果、TUI 和连接同步共用当前快照 */
  const getTasks = (): Task[] => tasks.map((task) => ({ ...task }));

  const publish = (ctx: ExtensionContext) => {
    if (ctx.mode === "tui") {
      const snapshot = getTasks();
      ctx.ui.setWidget(
        "paimon:task",
        snapshot.length > 0
          ? (_tui, theme) => new Text(renderWidgetText(snapshot, theme), 0, 0)
          : undefined,
      );
    }
    onChange();
  };

  // 启动、恢复 session 或切换分支时，恢复目标分支的计划并同步展示
  const restore = (_event: unknown, ctx: ExtensionContext) => {
    tasks = reconstructFromBranch(ctx.sessionManager.getBranch());
    publish(ctx);
  };
  pi.on("session_start", restore);
  pi.on("session_tree", restore);

  pi.registerTool<typeof TaskTrackerParams, TaskTrackerDetails>({
    name: "paimon_task",
    label: "Task Tracker",
    description:
      "Track task/plan progress. Actions: init (set task list), update (change task status), status (show current state), clear (remove task list).",
    promptSnippet:
      "Track current task progress in Paimon with init/update/status/clear actions",
    promptGuidelines: [
      "Use paimon_task to track implementation plan progress in Paimon: init with task names, update status as you work, clear when done.",
    ],
    parameters: TaskTrackerParams,
    executionMode: "sequential",

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const p: TaskTrackerInput = params;
      let result;

      switch (p.action) {
        case "init":
          result = handleInit(p.tasks);
          break;
        case "update":
          result = handleUpdate(tasks, p.index, p.status);
          break;
        case "status":
          result = handleStatus(tasks);
          break;
        case "clear":
          result = handleClear(tasks);
          break;
      }

      if (!result.error) tasks = result.tasks;
      publish(ctx);

      const details: TaskTrackerDetails = {
        action: p.action,
        tasks: getTasks(),
        ...(result.error ? { error: result.error } : {}),
      };

      return {
        content: [{ type: "text", text: result.text }],
        details,
        isError: result.error !== undefined,
      };
    },

    // 自定义渲染：工具调用摘要
    renderCall(args, theme) {
      const a: Partial<TaskTrackerInput> = args;
      let text = theme.fg("toolTitle", theme.bold("paimon_task "));
      text += theme.fg("muted", a.action ?? "");
      if (a.action === "update" && a.index !== undefined) {
        text += ` ${theme.fg("accent", `[${a.index}]`)}`;
        if (a.status) text += ` \u2192 ${theme.fg("dim", a.status)}`;
      }
      if (a.action === "init" && a.tasks) {
        text += ` ${theme.fg("dim", `(${a.tasks.length} tasks)`)}`;
      }
      return new Text(text, 0, 0);
    },

    // 自定义渲染：工具结果展示（含完整任务列表）
    renderResult(result, _options, theme) {
      const details = result.details;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (details.error) {
        return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
      }

      const taskList = details.tasks;
      switch (details.action) {
        case "init": {
          const lines: string[] = [];
          lines.push(
            theme.fg("success", "\u2713 ") +
              theme.fg(
                "muted",
                `Plan initialized with ${taskList.length} tasks`,
              ),
          );
          lines.push("");
          for (let i = 0; i < taskList.length; i++) {
            lines.push(
              `  ${theme.fg("dim", "\u25CB")} ${theme.fg("muted", `[${i}]`)} ${taskList[i].name}`,
            );
          }
          return new Text(lines.join("\n"), 0, 0);
        }
        case "update": {
          const complete = taskList.filter(
            (t) => t.status === "complete",
          ).length;
          return new Text(
            theme.fg("success", "\u2713 ") +
              theme.fg(
                "muted",
                `Updated (${complete}/${taskList.length} complete)`,
              ),
            0,
            0,
          );
        }
        case "status": {
          if (taskList.length === 0) {
            return new Text(theme.fg("dim", "No task list active"), 0, 0);
          }
          const complete = taskList.filter(
            (t) => t.status === "complete",
          ).length;
          const lines: string[] = [];
          lines.push(
            theme.fg("muted", `${complete}/${taskList.length} complete`),
          );
          for (const t of taskList) {
            const icon =
              t.status === "complete"
                ? theme.fg("success", "\u2713")
                : t.status === "in_progress"
                  ? theme.fg("warning", "\u2192")
                  : theme.fg("dim", "\u25CB");
            lines.push(`  ${icon} ${theme.fg("muted", t.name)}`);
          }
          return new Text(lines.join("\n"), 0, 0);
        }
        case "clear":
          return new Text(
            theme.fg("success", "\u2713 ") +
              theme.fg("muted", "Task list cleared"),
            0,
            0,
          );
        default:
          return new Text(theme.fg("dim", "Done"), 0, 0);
      }
    },
  });

  return { getTasks };
}
