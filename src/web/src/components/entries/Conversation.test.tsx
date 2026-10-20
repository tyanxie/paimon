import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import i18n from "../../i18n";
import type { InstanceStatus } from "../../../../protocol/types";
import type { SessionEntry, ToolExecutionState } from "../../stores/types";
import { useConversationDisplay } from "../InstanceView/useConversationDisplay";
import { ConversationList } from "./Conversation";
import { MessageTime } from "./MessageTime";

let root: Root;
let container: HTMLDivElement;
const emptyExecutions = new Map<string, ToolExecutionState>();

function message(id: string, role: string, content: unknown): SessionEntry {
  return { type: "message", id, message: { role, content } };
}
function text(value: string) {
  return { type: "text", text: value };
}
function call(id: string, name = "bash") {
  return {
    type: "toolCall",
    id,
    name,
    arguments: { command: `echo ${id}`, timeout: 5 },
  };
}
function result(id: string, content = "output", isError = false): SessionEntry {
  return {
    type: "message",
    id: `result-${id}`,
    message: {
      role: "toolResult",
      toolCallId: id,
      content: [text(content)],
      isError,
      durationMs: 1200,
    },
  };
}
function Probe({
  entries,
  executions,
  status,
  streaming,
  conversationKey,
  onReEdit,
  onBeforeToggle,
}: {
  entries: SessionEntry[];
  executions: ReadonlyMap<string, ToolExecutionState>;
  status: InstanceStatus;
  streaming: SessionEntry | null;
  conversationKey: string;
  onReEdit?: () => void;
  onBeforeToggle?: (element: HTMLElement) => void;
}) {
  const items = useConversationDisplay(entries, executions, streaming, status);
  return (
    <ConversationList
      items={items}
      entries={entries}
      status={status}
      isStreaming={streaming !== null}
      conversationKey={conversationKey}
      onReEdit={onReEdit}
      onBeforeToggle={onBeforeToggle}
    />
  );
}
async function render(
  entries: SessionEntry[],
  options: {
    executions?: ReadonlyMap<string, ToolExecutionState>;
    status?: InstanceStatus;
    streaming?: SessionEntry | null;
    conversationKey?: string;
    onReEdit?: () => void;
    onBeforeToggle?: (element: HTMLElement) => void;
  } = {},
) {
  await act(async () =>
    root.render(
      <Probe
        entries={entries}
        executions={options.executions ?? emptyExecutions}
        status={options.status ?? "idle"}
        streaming={options.streaming ?? null}
        conversationKey={options.conversationKey ?? "instance:session"}
        onReEdit={options.onReEdit}
        onBeforeToggle={options.onBeforeToggle}
      />,
    ),
  );
}
async function click(element: Element) {
  await act(async () => (element as HTMLElement).click());
}
function replyButton() {
  return container.querySelector<HTMLButtonElement>("article > div > button")!;
}
function executionButton(index = 0) {
  return container.querySelectorAll<HTMLButtonElement>(
    "[data-execution-key] > button",
  )[index]!;
}
function contentOf(button: HTMLButtonElement) {
  return document.getElementById(button.getAttribute("aria-controls")!)!;
}

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  await i18n.changeLanguage("zh-CN");
});

describe("回复与执行汇总", () => {
  test("页面展示大圆角回复，工具组与正文交替排列", async () => {
    await render([
      message("u1", "user", "question"),
      message("a1", "assistant", [
        call("one"),
        text("body A"),
        call("two"),
        text("body B"),
      ]),
      result("one"),
      result("two"),
    ]);
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelector("article")!.className).toContain(
      "rounded-[24px]",
    );
    expect(replyButton().getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll("[data-execution-key]")).toHaveLength(2);
    expect(executionButton().textContent).toContain("1 个工具执行完成");
    expect(container.querySelector("[data-tool-state]")).toBeNull();
    const keys = Array.from(container.querySelectorAll("[data-entry-key]")).map(
      (element) => element.getAttribute("data-entry-key"),
    );
    expect(keys).toEqual([
      "u1",
      "reply:u1",
      "execution:a1:block:0",
      "a1:block:1",
      "execution:a1:block:2",
      "a1:block:3",
    ]);
    expect(container.textContent).toContain("body A");
    expect(container.textContent).toContain("body B");
  });

  test("工具独立展开，完成和历史结果交接保留列表与详情", async () => {
    const entries = [message("a1", "assistant", [call("one")])];
    await render(entries, {
      status: "streaming",
      executions: new Map([
        [
          "one",
          { status: "running", partialResult: { content: [text("partial")] } },
        ],
      ]),
    });
    const summary = executionButton();
    expect(summary.textContent).toContain("1 个工具执行中");
    await click(summary);
    const tool =
      container.querySelector<HTMLButtonElement>("[data-tool-state]")!;
    await click(tool);
    expect(container.textContent).toContain("partial");
    expect(container.textContent).toContain("超时时间");
    await render(entries, {
      executions: new Map([
        [
          "one",
          {
            status: "completed",
            result: { content: [text("final")] },
            isError: false,
            durationMs: 1200,
          },
        ],
      ]),
    });
    expect(executionButton()).toBe(summary);
    expect(summary.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("[data-tool-state]")).toBe(tool);
    expect(container.textContent).toContain("final");
    expect(container.textContent).toContain("1.2\u00a0s");
    await render([...entries, result("one", "history final")]);
    expect(container.textContent).toContain("history final");
    expect(summary.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelectorAll(".fixed-viewport")).toHaveLength(1);
  });

  test("整组收起再展开，内部工具开关和组件身份保持不变", async () => {
    await render([message("a1", "assistant", [call("one")]), result("one")]);
    const summary = executionButton();
    await click(summary);
    const tool = container.querySelector("[data-tool-state]");
    await click(replyButton());
    expect(replyButton().getAttribute("aria-expanded")).toBe("false");
    expect(contentOf(replyButton()).getAttribute("aria-hidden")).toBe("true");
    expect(contentOf(replyButton()).hasAttribute("inert")).toBe(true);
    await click(replyButton());
    expect(summary.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("[data-tool-state]")).toBe(tool);
    await click(summary);
    expect(contentOf(summary).getAttribute("aria-hidden")).toBe("true");
    expect(contentOf(summary).hasAttribute("inert")).toBe(true);
  });

  test("用户主动收起后，新的工具状态和正文继续保持收起", async () => {
    const entries = [message("a1", "assistant", [call("one")])];
    await render(entries);
    const summary = executionButton();
    await click(summary);
    await click(summary);
    await click(replyButton());
    await render([
      ...entries,
      result("one"),
      message("a2", "assistant", [text("new body")]),
    ]);
    expect(replyButton().getAttribute("aria-expanded")).toBe("false");
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    expect(replyButton().textContent).toContain("1 个工具执行完成");
    await click(replyButton());
    expect(summary.getAttribute("aria-expanded")).toBe("false");
  });

  test("各个执行组的开关相互独立", async () => {
    await render([
      message("a1", "assistant", [call("one"), text("body"), call("two")]),
    ]);
    await click(executionButton(0));
    expect(executionButton(0).getAttribute("aria-expanded")).toBe("true");
    expect(executionButton(1).getAttribute("aria-expanded")).toBe("false");
  });

  test("thinking 单独展开，正文和工具出现后保留用户选择", async () => {
    const entry = message("a1", "assistant", [
      { type: "thinking", thinking: "plan" },
    ]);
    await render([entry], { status: "streaming", streaming: entry });
    expect(executionButton().textContent).toContain("思考中");
    expect(executionButton().textContent).not.toContain("个工具");
    await click(executionButton());
    const thinking = container.querySelector<HTMLButtonElement>(
      "[data-execution-key] button[aria-controls]",
    )!;
    const thinkingButton = container.querySelectorAll<HTMLButtonElement>(
      "[data-execution-key] button[aria-controls]",
    )[1]!;
    expect(thinkingButton.getAttribute("aria-expanded")).toBe("false");
    await click(thinkingButton);
    const updated = {
      ...entry,
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "longer plan" },
          call("one"),
          text("answer"),
        ],
      },
    };
    await render([updated], { status: "streaming", streaming: updated });
    expect(executionButton()).toBe(thinking);
    expect(thinkingButton.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("longer plan");
    expect(contentOf(thinkingButton).getAttribute("aria-hidden")).toBe("false");
  });

  test("历史 prepend 保留展开状态，session 切换重置开关", async () => {
    const entries = [
      message("u1", "user", "question"),
      message("a1", "assistant", [call("one")]),
    ];
    await render(entries);
    const summary = executionButton();
    await click(summary);
    await render([message("older", "assistant", [text("old")]), ...entries]);
    expect(executionButton()).toBe(summary);
    expect(summary.getAttribute("aria-expanded")).toBe("true");
    await render(entries, { conversationKey: "instance:new-session" });
    expect(executionButton().getAttribute("aria-expanded")).toBe("false");
    expect(replyButton().getAttribute("aria-expanded")).toBe("true");
  });

  test("折叠操作提供点击元素用于保持阅读位置", async () => {
    const elements: HTMLElement[] = [];
    await render([message("a1", "assistant", [call("one")])], {
      onBeforeToggle: (element) => {
        elements.push(element);
      },
    });
    await click(executionButton());
    await click(replyButton());
    expect(elements).toEqual([executionButton(), replyButton()]);
  });
});

describe("状态、系统事件与图片", () => {
  test("没有 assistant 内容时展示运行提示，回复到达后保持容器身份", async () => {
    const user = message("u1", "user", "question");
    await render([user], { status: "streaming" });
    const article = container.querySelector("article")!;
    expect(article.textContent).toContain("执行中");
    await click(replyButton());
    await render([user, message("a1", "assistant", [text("answer")])], {
      status: "streaming",
    });
    expect(container.querySelector("article")).toBe(article);
    expect(replyButton().getAttribute("aria-expanded")).toBe("false");
  });

  test("压缩与普通运行使用不同提示，idle 结束运行指示", async () => {
    const entries = [message("a1", "assistant", [text("answer")])];
    await render(entries, { status: "compacting" });
    expect(container.querySelector('[role="status"]')!.textContent).toContain(
      "压缩中",
    );
    await render(entries, { status: "idle" });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  test("失败、终止和未知状态准确显示，未知工具详情使用静态提示", async () => {
    const entries = [
      message("a1", "assistant", [call("one"), call("two")]),
      result("two", "failed", true),
    ];
    await render(entries);
    expect(executionButton().textContent).toContain("1 个工具执行失败");
    expect(executionButton().textContent).toContain("1 个工具状态未知");
    await click(executionButton());
    const unknown = container.querySelector<HTMLButtonElement>(
      '[data-tool-state="unknown"]',
    )!;
    await click(unknown);
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(container.querySelector(".fixed-viewport")!.textContent).toContain(
      "状态未知",
    );
  });

  test("各类工具在缺少结果时使用静态状态提示", async () => {
    for (const name of ["read", "bash", "write", "edit", "custom"]) {
      await render([message("a1", "assistant", [call("one", name)])], {
        conversationKey: `session:${name}`,
      });
      await click(executionButton());
      await click(container.querySelector('[data-tool-state="unknown"]')!);
      expect(container.querySelector(".fixed-viewport")!.textContent).toContain(
        "状态未知",
      );
      expect(container.querySelector(".animate-spin")).toBeNull();
    }
  });

  test("实例 idle 时停止工具运行指示并保留未知结果", async () => {
    const entries = [message("a1", "assistant", [call("one")])];
    const executions = new Map<string, ToolExecutionState>([
      ["one", { status: "running", startedAt: 10 }],
    ]);
    await render(entries, { status: "streaming", executions });
    await click(executionButton());
    expect(
      container.querySelector('[data-tool-state="running"]'),
    ).not.toBeNull();
    await render(entries, { status: "idle", executions });
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(
      container.querySelector('[data-tool-state="unknown"]'),
    ).not.toBeNull();
    expect(executionButton().textContent).toContain("状态未知");
  });

  test("整组收起后仍保留终止状态与重新编辑入口", async () => {
    const aborted = message("a1", "assistant", []);
    aborted.message!.stopReason = "aborted";
    aborted.message!.errorMessage = "stopped";
    let edits = 0;
    await render([aborted], {
      onReEdit: () => {
        edits += 1;
      },
    });
    expect(container.textContent).toContain("stopped");
    await click(replyButton());
    expect(replyButton().textContent).toContain("已终止");
    const edit = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "重新编辑",
    )!;
    await click(edit);
    expect(edits).toBe(1);
  });

  test("系统摘要保留顺序并支持查看完整内容", async () => {
    const summary = "full summary with details";
    await render([
      message("a1", "assistant", [text("before")]),
      { type: "compaction", id: "s1", summary },
      message("a2", "assistant", [text("after")]),
    ]);
    expect(container.textContent).toContain("上下文已压缩");
    await click(container.querySelector(".conversation-system button")!);
    expect(container.querySelector(".fixed-viewport")!.textContent).toContain(
      summary,
    );
    expect(container.textContent).toContain("before");
    expect(container.textContent).toContain("after");
  });

  test("用户图片保留预览入口与国际化描述", async () => {
    await render([
      message("u1", "user", [
        text("question"),
        { type: "image", data: "data", mimeType: "image/png" },
      ]),
    ]);
    const image = container.querySelector("img")!;
    expect(image.getAttribute("alt")).toBe("附加图片 1");
    await click(container.querySelector('[aria-label="附加图片 1"]')!);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  test("英文工具数量和操作标签使用正确的复数", async () => {
    await i18n.changeLanguage("en");
    await render([
      message("a1", "assistant", [call("one"), call("two")]),
      result("one"),
      result("two"),
    ]);
    expect(executionButton().textContent).toContain("2 tools completed");
    expect(replyButton().getAttribute("aria-label")).toBe("Collapse reply");
  });
});

describe("消息时间", () => {
  test("聚焦显示真实时间范围，Esc 关闭提示", async () => {
    const values = ["2026-01-01T00:00:00Z", "2026-01-01T00:01:00Z"];
    await act(async () => root.render(<MessageTime timestamps={values} />));
    const button = container.querySelector("button")!;
    await act(async () => button.focus());
    const tooltip = document.querySelector('[role="tooltip"]')!;
    expect(tooltip).not.toBeNull();
    expect(
      Array.from(tooltip.querySelectorAll("time")).map((time) => time.dateTime),
    ).toEqual(values);
    expect(tooltip.textContent).toContain(
      new Date(values[0]!).toLocaleString("zh-CN"),
    );
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  test("hover 提供时间提示，移开后关闭", async () => {
    await act(async () =>
      root.render(<MessageTime timestamps={["2026-01-01T00:00:00Z"]} />),
    );
    const button = container.querySelector("button")!;
    await act(async () =>
      button.dispatchEvent(
        new MouseEvent("mouseover", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      ),
    );
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    await act(async () =>
      button.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      ),
    );
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  test("触摸点击可以查看时间，外部点击关闭", async () => {
    await act(async () =>
      root.render(<MessageTime timestamps={["2026-01-01T00:00:00Z"]} />),
    );
    await click(container.querySelector("button")!);
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    await act(async () =>
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      ),
    );
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  test("缺少或无效时间时保留内容并省略时间入口", async () => {
    await act(async () =>
      root.render(<MessageTime timestamps={[undefined, "invalid"]} />),
    );
    expect(container.querySelector("button")).toBeNull();
  });
});
