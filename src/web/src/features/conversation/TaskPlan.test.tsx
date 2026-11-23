import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MotionConfig } from "motion/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Task, TaskStatus } from "../../../../protocol/types";
import i18n from "../../i18n";
import { TaskPlan } from "./TaskPlan";
let root: Root;
let container: HTMLDivElement;
let language: string;
beforeEach(async () => {
  language = i18n.language;
  await i18n.changeLanguage("zh-CN");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  await i18n.changeLanguage(language);
});
function plan(...statuses: TaskStatus[]): Task[] {
  return statuses.map((status, index) => ({
    name: `任务 ${index + 1}`,
    status,
  }));
}
async function render(tasks: unknown) {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <TaskPlan tasks={tasks} />
      </MotionConfig>,
    ),
  );
}
function toggle() {
  return container.querySelector<HTMLButtonElement>(".composer-task-toggle")!;
}
function panel() {
  const id = toggle().getAttribute("aria-controls")!;
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing task panel");
  return element;
}
async function click() {
  await act(async () => toggle().click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}
describe("任务计划展示", () => {
  test.each([
    { tasks: undefined },
    { tasks: null },
    { tasks: [] },
    { tasks: [{ name: "bad", status: "unknown" }] },
    { tasks: [{ name: 1, status: "pending" }] },
  ])("空或无效快照隐藏任务区域：%j", async ({ tasks }) => {
    await render(tasks);
    expect(container.childElementCount).toBe(0);
  });
  test.each([
    {
      statuses: ["pending", "pending"],
      summary: "暂无进行中任务",
      count: "0/2",
      named: false,
    },
    {
      statuses: ["complete", "pending"],
      summary: "暂无进行中任务",
      count: "1/2",
      named: false,
    },
    {
      statuses: ["complete", "in_progress", "pending"],
      summary: "任务 2",
      count: "1/3",
      named: true,
    },
    {
      statuses: ["in_progress", "in_progress"],
      summary: "多项任务进行中",
      count: "0/2",
      named: false,
    },
    {
      statuses: ["complete", "complete"],
      summary: "全部完成",
      count: "2/2",
      named: false,
    },
  ] satisfies {
    statuses: TaskStatus[];
    summary: string;
    count: string;
    named: boolean;
  }[])("摘要与进度：$summary", async ({ statuses, summary, count, named }) => {
    await render(plan(...statuses));
    const current = container.querySelector(".composer-task-current")!;
    expect(current.textContent).toBe(summary);
    expect(current.hasAttribute("data-summary")).toBe(!named);
    expect(current.querySelector("svg") !== null).toBe(named);
    expect(container.querySelector(".composer-task-ring")?.textContent).toBe(
      count,
    );
    expect(container.querySelector(".composer-task-ring-check") !== null).toBe(
      statuses.every((status) => status === "complete"),
    );
    expect(toggle().getAttribute("aria-label")).toContain(summary);
    expect(
      [...container.querySelectorAll(".composer-task-item")].map((item) =>
        item.getAttribute("data-task-status"),
      ),
    ).toEqual(statuses);
  });
  test("自身提供动画环境，点击展开收起并保留快照更新时的阅读选择", async () => {
    await render(plan("pending", "in_progress"));
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(panel().getAttribute("aria-hidden")).toBe("true");
    expect(panel().hasAttribute("inert")).toBe(true);
    await click();
    const original = panel();
    expect(original.style.height).toBe("auto");
    expect(original.style.visibility).toBe("visible");
    expect(original.hasAttribute("inert")).toBe(false);
    const details = original.querySelector<HTMLDivElement>(
      ".composer-task-details",
    )!;
    details.scrollTop = 40;
    await render(plan("complete", "in_progress"));
    expect(panel()).toBe(original);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(original.querySelector(".composer-task-details")).toBe(details);
    expect(details.scrollTop).toBe(40);
    await click();
    expect(original.style.height).toBe("0px");
    expect(original.getAttribute("aria-hidden")).toBe("true");
    expect(original.hasAttribute("inert")).toBe(true);
    await render(plan("complete", "complete"));
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".composer-task-current")?.textContent).toBe(
      "全部完成",
    );
    await render([]);
    expect(container.childElementCount).toBe(0);
  });
  test("长名称保持完整原文，未知扩展字段不影响展示", async () => {
    const name = "检查长任务名称在折叠时截断并在展开后显示完整内容".repeat(5);
    await render([{ name, status: "in_progress", extra: true }]);
    expect(
      container.querySelector(".composer-task-current")?.getAttribute("title"),
    ).toBe(name);
    expect(container.querySelector(".composer-task-item")?.textContent).toBe(
      name,
    );
  });
  test("英文覆盖各摘要及步骤状态的可访问名称", async () => {
    await i18n.changeLanguage("en");
    for (const [tasks, summary] of [
      [plan("pending"), "No tasks in progress"],
      [plan("in_progress", "in_progress"), "Multiple tasks in progress"],
      [plan("complete"), "All tasks completed"],
    ] as const) {
      await render(tasks);
      expect(toggle().getAttribute("aria-label")).toContain(summary);
    }
    await render(plan("pending", "in_progress", "complete"));
    expect(
      [...container.querySelectorAll('[role="img"]')]
        .slice(1)
        .map((item) => item.getAttribute("aria-label")),
    ).toEqual(["Pending", "In progress", "Completed"]);
  });
});
