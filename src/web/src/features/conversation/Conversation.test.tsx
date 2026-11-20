import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { MotionConfig } from "motion/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { InstanceStatus } from "../../../../protocol/types";
import i18n from "../../i18n";
import { ConversationList } from "./Conversation";
import { MessageTime } from "./MessageTime";
import type { SessionEntry, ToolExecutionState } from "./types";
import { useConversationDisplay } from "./useConversationDisplay";

let root: Root;
let container: HTMLDivElement;
function message(
  id: string,
  role: string,
  content: unknown,
  timing: { timestamp?: number; durationMs?: number } = {},
): SessionEntry {
  return { type: "message", id, message: { role, content, ...timing } };
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
interface Options {
  executions?: ReadonlyMap<string, ToolExecutionState>;
  status?: InstanceStatus;
  streaming?: SessionEntry | null;
  conversationKey?: string;
  onReEdit?: () => void;
  onBeforeToggle?: (element: HTMLElement) => void;
  pendingUserEntry?: SessionEntry | null;
  isAwaitingReply?: boolean;
}
function Probe({
  entries,
  options,
}: {
  entries: SessionEntry[];
  options: Options;
}) {
  const items = useConversationDisplay(
    entries,
    options.executions ?? new Map(),
    options.streaming ?? null,
    options.status ?? "idle",
  );
  return (
    <ConversationList
      items={items}
      status={options.status ?? "idle"}
      isStreaming={!!options.streaming}
      conversationKey={options.conversationKey ?? "instance:session"}
      onReEdit={options.onReEdit}
      onBeforeToggle={options.onBeforeToggle}
      pendingUserEntry={options.pendingUserEntry}
      isAwaitingReply={options.isAwaitingReply}
    />
  );
}
async function render(entries: SessionEntry[], options: Options = {}) {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <Probe entries={entries} options={options} />
      </MotionConfig>,
    ),
  );
}
async function click(element: Element) {
  await act(async () => (element as HTMLElement).click());
}
function executionButton(index = 0) {
  return container.querySelectorAll<HTMLButtonElement>(
    "[data-execution-key] > button",
  )[index]!;
}
function contentOf(button: HTMLButtonElement) {
  return document.getElementById(button.getAttribute("aria-controls")!)!;
}
function replyTimeButton(scope: ParentNode = container) {
  return scope.querySelector<HTMLButtonElement>(
    `button[aria-label^="${i18n.t("conversation.viewReplyTime")}:"]`,
  )!;
}
async function openReplyTime(scope: ParentNode = container) {
  await click(replyTimeButton(scope));
  return document.querySelector<HTMLElement>('[role="dialog"]:not([inert])')!;
}
function detailValue(details: HTMLElement, label: string) {
  return Array.from(details.querySelectorAll("dt"))
    .find((term) => term.textContent === label)!
    .parentElement!.querySelector("dd")!;
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
  test("回复常开，执行组和正文保持原始顺序", async () => {
    const entry = message(
      "a1",
      "assistant",
      [call("one"), text("body A"), call("two"), text("body B")],
      { timestamp: Date.parse("2026-01-01T12:00:00Z") },
    );
    await render([
      message("u1", "user", "question"),
      entry,
      result("one"),
      result("two"),
    ]);
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(
      container
        .querySelector("article button[aria-expanded]")
        ?.closest("[data-execution-key]"),
    ).not.toBeNull();
    expect(container.querySelectorAll("[data-execution-key]")).toHaveLength(2);
    expect(
      container.querySelectorAll(
        '.conversation-reply-time button[aria-label^="查看回复时间:"]',
      ),
    ).toHaveLength(1);
    expect(
      container.querySelector(
        '.conversation-part button[aria-label^="查看回复时间:"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(".conversation-part")!.className,
    ).not.toContain("grid");
    expect(
      Array.from(container.querySelectorAll("[data-entry-key]")).map(
        (element) => element.getAttribute("data-entry-key"),
      ),
    ).toEqual([
      "u1",
      "reply:u1",
      "execution:a1:block:0",
      "a1:block:1",
      "execution:a1:block:2",
      "a1:block:3",
    ]);
    expect(
      container.querySelector('article button[aria-label^="查看回复时间:"]'),
    ).toBeNull();
    expect(executionButton().textContent).toContain("bash");
    expect(executionButton().textContent).not.toContain("工具与思考");
    expect(container.textContent).toContain("body A");
    expect(container.textContent).toContain("body B");
  });
  test("准备与运行数量分别展示，工具和组可以同时显示运行指示", async () => {
    await render(
      [
        message("a1", "assistant", [
          { type: "thinking", thinking: "plan" },
          { type: "thinking", thinking: "" },
          call("done"),
          call("running"),
          call("pending"),
        ]),
        result("done"),
      ],
      {
        status: "streaming",
        streaming: null,
        executions: new Map([["running", { status: "running" }]]),
      },
    );
    expect(
      executionButton().querySelector('[aria-label="1 个工具执行中"]'),
    ).not.toBeNull();
    expect(
      executionButton().querySelector('[aria-label="1 段思考过程"]'),
    ).not.toBeNull();
    const counts = executionButton().querySelector(
      ".conversation-execution-counts",
    )!;
    const names = executionButton().querySelector(".conversation-tool-names")!;
    expect(counts.nextElementSibling).toBe(names);
    expect(counts.querySelector("[data-tool-status]")).not.toBeNull();
    expect(counts.querySelector("[data-thinking-status]")).not.toBeNull();
    await click(executionButton());
    expect(
      container.querySelector('[data-tool-state="running"] .animate-spin'),
    ).not.toBeNull();
    expect(executionButton().querySelector(".animate-spin")).not.toBeNull();
    const live = message("a2", "assistant", [call("preparing")]);
    await render([live], {
      streaming: live,
      status: "streaming",
      conversationKey: "preparing",
    });
    expect(
      executionButton().querySelector('[aria-label="1 个工具准备中"]'),
    ).not.toBeNull();
    expect(
      executionButton().querySelector('[data-tool-status="running"]'),
    ).toBeNull();
  });
  test("完成与历史结果交接保留工具详情与组件身份", async () => {
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
    await click(summary);
    const tool = container.querySelector("[data-tool-state]")!;
    await click(tool);
    expect(document.body.textContent).toContain("partial");
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
    expect(container.querySelector("[data-tool-state]")).toBe(tool);
    expect(document.body.textContent).toContain("final");
    await render([...entries, result("one", "history final")]);
    expect(document.body.textContent).toContain("history final");
    expect(document.querySelectorAll(".fixed-viewport")).toHaveLength(1);
  });
  test("收折执行组保留内部身份，新正文保持可见", async () => {
    const entries = [message("a1", "assistant", [call("one")])];
    await render(entries);
    const summary = executionButton();
    await click(summary);
    const tool = container.querySelector("[data-tool-state]");
    await click(summary);
    expect(contentOf(summary).getAttribute("aria-hidden")).toBe("true");
    expect(contentOf(summary).hasAttribute("inert")).toBe(true);
    await render([
      ...entries,
      result("one"),
      message("a2", "assistant", [text("new body")]),
    ]);
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).toContain("new body");
    await click(summary);
    expect(container.querySelector("[data-tool-state]")).toBe(tool);
  });
  test("执行组独立开关，thinking 保留展开选择", async () => {
    const entry = message("a1", "assistant", [
      { type: "thinking", thinking: "plan" },
      text("body"),
      call("one"),
    ]);
    await render([entry]);
    await click(executionButton());
    expect(executionButton(1).getAttribute("aria-expanded")).toBe("false");
    const thinking = container.querySelector<HTMLButtonElement>(
      ".conversation-thinking-toggle",
    )!;
    await click(thinking);
    const updated = message("a1", "assistant", [
      { type: "thinking", thinking: "longer plan" },
      text("body"),
      call("one"),
    ]);
    await render([updated]);
    expect(thinking.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("longer plan");
  });
  test("历史追加保留展开状态，session 切换重置", async () => {
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
    await render(entries, { conversationKey: "new-session" });
    expect(executionButton().getAttribute("aria-expanded")).toBe("false");
  });
  test("展开操作提供阅读位置入口", async () => {
    const elements: HTMLElement[] = [];
    await render([message("a1", "assistant", [call("one")])], {
      onBeforeToggle: (element) => {
        elements.push(element);
      },
    });
    await click(executionButton());
    expect(elements).toEqual([executionButton()]);
  });
  test("工具名称摘要去重，状态变化保持相同摘要", async () => {
    const entries = [
      message("a1", "assistant", [
        call("one", "read"),
        call("two", "bash"),
        call("three", "read"),
      ]),
    ];
    await render(entries, {
      status: "streaming",
      executions: new Map([["two", { status: "running" }]]),
    });
    const names = executionButton().querySelector(".conversation-tool-names");
    expect(
      Array.from(names!.querySelectorAll("[data-tool-name]")).map(
        (element) => element.textContent,
      ),
    ).toEqual(["read", "bash"]);
    expect(names?.textContent?.replace(/\+\d+/g, "")).not.toContain(",");
    await render([...entries, result("one"), result("two"), result("three")]);
    expect(executionButton().querySelector(".conversation-tool-names")).toBe(
      names,
    );
    expect(
      executionButton().querySelector('[aria-label="3 个工具执行完成"]'),
    ).not.toBeNull();
  });
  test("工具名称按可用宽度展示，剩余类型显示数量并支持完整展开", async () => {
    let available = 150;
    const rectSpy = spyOn(
      HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(function (this: HTMLElement) {
      const width = this.classList.contains("conversation-tool-names")
        ? available
        : this.hasAttribute("data-measure-name")
          ? 40
          : this.hasAttribute("data-measure-overflow")
            ? 20
            : 0;
      return {
        width,
        height: 20,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 20,
        right: width,
        toJSON: () => ({}),
      };
    });
    const disconnectSpy = spyOn(ResizeObserver.prototype, "disconnect");
    try {
      const entries = [
        message("a1", "assistant", [
          call("one", "read"),
          call("two", "bash"),
          call("three", "edit"),
          call("four", "write"),
          call("five", "custom"),
          call("six", "read"),
        ]),
      ];
      await render(entries);
      const summary = executionButton();
      const visibleNames = () =>
        Array.from(summary.querySelectorAll("[data-tool-name]")).map(
          (element) => element.getAttribute("data-tool-name"),
        );
      expect(visibleNames()).toEqual(["read", "bash", "edit"]);
      expect(
        summary.querySelector(".conversation-tool-overflow")!.textContent,
      ).toBe("+2");
      expect(
        summary
          .querySelector(".conversation-tool-overflow")!
          .getAttribute("aria-label"),
      ).toBe("另外 2 种工具");
      expect(summary.querySelectorAll("button")).toHaveLength(0);
      available = 250;
      await render([...entries]);
      expect(visibleNames()).toEqual([
        "read",
        "bash",
        "edit",
        "write",
        "custom",
      ]);
      expect(summary.querySelector(".conversation-tool-overflow")).toBeNull();
      available = 90;
      await render([...entries]);
      expect(visibleNames()).toEqual(["read"]);
      expect(
        summary.querySelector(".conversation-tool-overflow")!.textContent,
      ).toBe("+4");
      available = 10;
      await render([...entries]);
      expect(visibleNames()).toEqual([]);
      expect(
        summary.querySelector(".conversation-tool-overflow")!.textContent,
      ).toBe("+5");
      await act(async () => i18n.changeLanguage("en"));
      expect(
        summary
          .querySelector(".conversation-tool-overflow")!
          .getAttribute("aria-label"),
      ).toBe("5 more tool types");
      await click(summary);
      expect(container.querySelectorAll("[data-tool-state]")).toHaveLength(6);
      await render([]);
      expect(disconnectSpy).toHaveBeenCalled();
    } finally {
      rectSpy.mockRestore();
      disconnectSpy.mockRestore();
    }
  });
  test("只有 thinking 时省略工具名称区域", async () => {
    await render([
      message("a1", "assistant", [{ type: "thinking", thinking: "plan" }]),
    ]);
    expect(
      executionButton().querySelector(".conversation-tool-names"),
    ).toBeNull();
    expect(
      executionButton().querySelector("[data-thinking-status]"),
    ).not.toBeNull();
  });
  test("英文汇总使用正确复数", async () => {
    await render([
      message("a1", "assistant", [call("one"), call("two")]),
      result("one"),
      result("two"),
    ]);
    await act(async () => i18n.changeLanguage("en"));
    expect(
      executionButton().querySelector('[aria-label="2 tools completed"]'),
    ).not.toBeNull();
  });
});

describe("状态、系统事件与图片", () => {
  test("idle 时同时显示本地气泡与等待，真实消息和正文接替时保留 DOM 身份", async () => {
    const user: SessionEntry = {
      type: "message",
      __renderKey: "local-user",
      message: { role: "user", content: [text("question")] },
    };
    await render([], { pendingUserEntry: user, isAwaitingReply: true });
    const bubble = container.querySelector('[data-entry-key="local-user"]');
    const article = container.querySelector("article");
    expect(bubble?.textContent).toContain("question");
    expect(article?.textContent).toContain("等待回复");
    const confirmedUser: SessionEntry = {
      ...user,
      message: { role: "user", content: "question" },
    };
    await render([confirmedUser], { isAwaitingReply: true });
    expect(
      container.querySelectorAll('[data-entry-key="local-user"]'),
    ).toHaveLength(1);
    expect(container.querySelector('[data-entry-key="local-user"]')).toBe(
      bubble,
    );
    expect(container.querySelector("article")).toBe(article);
    expect(article?.textContent).toContain("等待回复");
    await render(
      [confirmedUser, message("a1", "assistant", [text("answer")])],
      {
        status: "streaming",
      },
    );
    expect(container.querySelector("article")).toBe(article);
    expect(article?.textContent).toContain("answer");
    expect(article?.textContent).not.toContain("等待回复");
  });

  test("等待内容与正文到达保持回复身份，压缩独立于回复", async () => {
    const user = message("u1", "user", "question");
    await render([user], { status: "streaming" });
    const footer = container.querySelector(".conversation-reply-time")!;
    expect(footer.textContent).not.toContain("运行中");
    expect(footer.querySelector("time")).toBeNull();
    expect(footer.querySelector(".conversation-duration")).toBeNull();
    const article = container.querySelector("article");
    await render([user, message("a1", "assistant", [text("answer")])], {
      status: "streaming",
    });
    expect(container.querySelector("article")).toBe(article);
    await render([user, message("a1", "assistant", [text("answer")])], {
      status: "compacting",
    });
    expect(container.querySelector("article .conversation-system")).toBeNull();
    expect(
      container.querySelector('[data-system-state="compacting"]')!.textContent,
    ).toContain("正在整理上下文");
    await render([user], { status: "compacting" });
    expect(container.querySelector("article")).toBeNull();
    await render([user]);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
  test("系统摘要处于两段回复之间并支持详情", async () => {
    await render([
      message("a1", "assistant", [text("before")]),
      { type: "compaction", id: "s1", summary: "full summary" },
      message("a2", "assistant", [text("after")]),
    ]);
    expect(container.querySelectorAll("article")).toHaveLength(2);
    expect(container.querySelector("article .conversation-system")).toBeNull();
    await click(container.querySelector(".conversation-system button")!);
    expect(document.querySelector(".fixed-viewport")!.textContent).toContain(
      "full summary",
    );
  });
  test("缺少工具结果采用静态说明，idle 停止运行指示", async () => {
    for (const name of ["read", "bash", "write", "edit", "custom"]) {
      const entries = [message("a1", "assistant", [call("one", name)])];
      await render(entries, { conversationKey: name });
      await click(executionButton());
      await click(container.querySelector('[data-tool-state="unknown"]')!);
      expect(document.querySelector(".fixed-viewport")!.textContent).toContain(
        "结果不可用",
      );
      expect(document.querySelector(".animate-spin")).toBeNull();
    }
    const entries = [message("a1", "assistant", [call("one")])];
    const executions = new Map<string, ToolExecutionState>([
      ["one", { status: "running", startedAt: 10 }],
    ]);
    await render(entries, {
      status: "streaming",
      executions,
      conversationKey: "running",
    });
    await click(executionButton());
    await render(entries, {
      status: "idle",
      executions,
      conversationKey: "running",
    });
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(
      container.querySelector('[data-tool-state="unknown"]'),
    ).not.toBeNull();
  });
  test("终止状态与重新编辑持续可见", async () => {
    const entry = message("a1", "assistant", []);
    entry.message!.stopReason = "aborted";
    entry.message!.errorMessage = "stopped";
    let edits = 0;
    await render([entry], {
      onReEdit: () => {
        edits++;
      },
    });
    expect(container.textContent).toContain("stopped");
    expect(container.textContent).toContain("已终止");
    await click(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "重新编辑",
      )!,
    );
    expect(edits).toBe(1);
  });
  test("用户省略可见角色名称，图片保留预览入口", async () => {
    const entry = message("u1", "user", [
      text("question"),
      { type: "image", data: "data", mimeType: "image/png" },
    ]);
    entry.timestamp = "2026-01-01T12:00:00Z";
    await render([entry]);
    expect(container.textContent).not.toContain("用户");
    expect(
      container.querySelector('[aria-label="你发送的消息"]'),
    ).not.toBeNull();
    expect(container.querySelector(".conversation-time")).not.toBeNull();
    await click(container.querySelector('[aria-label="附加图片 1"]')!);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});

describe("消息时间", () => {
  test("常显日期与时分秒，时间采用可选择的静态文字", async () => {
    const timestamp = "2026-01-01T00:00:00Z";
    await act(async () => root.render(<MessageTime timestamp={timestamp} />));
    const time = container.querySelector(".conversation-time")!;
    expect(
      Array.from(time.querySelectorAll("time")).map((value) => value.dateTime),
    ).toEqual([timestamp]);
    expect(time.textContent).toContain(
      new Date(timestamp).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }),
    );
    expect(time.className).toContain("select-text");
    expect(container.querySelector("button")).toBeNull();
    expect(time.hasAttribute("tabindex")).toBe(false);
    await act(async () =>
      time.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })),
    );
    await click(time);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
  test("缺少或无效静态时间时不显示时间文字", async () => {
    for (const timestamp of [undefined, "invalid"]) {
      await act(async () => root.render(<MessageTime timestamp={timestamp} />));
      expect(container.querySelector(".conversation-time")).toBeNull();
    }
  });
  test("回复时间使用首条模型消息开始和末条模型消息结束，覆盖中间间隔", async () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    const first = message("a1", "assistant", [call("one")], {
      timestamp: start,
      durationMs: 2000,
    });
    const last = message("a2", "assistant", [text("last")], {
      timestamp: start + 70000,
      durationMs: 3000,
    });
    first.timestamp = new Date(start + 2000).toISOString();
    last.timestamp = new Date(start + 80000).toISOString();
    await render([first, result("one"), last]);
    const footer = container.querySelector(".conversation-reply-time")!;
    expect(footer.querySelector("time")).toBeNull();
    expect(replyTimeButton(footer).textContent).toBe("耗时 1 分 13 秒");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const details = await openReplyTime(footer);
    expect(
      Array.from(details.querySelectorAll("time")).map((time) => time.dateTime),
    ).toEqual([
      new Date(start).toISOString(),
      new Date(start + 73000).toISOString(),
    ]);
    expect(detailValue(details, "耗时").textContent).toBe("1 分 13 秒");
    expect(replyTimeButton(footer).getAttribute("aria-expanded")).toBe("true");
    await click(replyTimeButton(footer));
    expect(document.querySelector('[role="dialog"]:not([inert])')).toBeNull();
    expect(replyTimeButton(footer).getAttribute("aria-expanded")).toBe("false");
  });
  test("纯文本单条回复显示耗时摘要，详情提供完整起止时间", async () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    await render([
      message("a1", "assistant", [text("answer")], {
        timestamp: start,
        durationMs: 12300,
      }),
    ]);
    expect(replyTimeButton().textContent).toBe("耗时 12 秒");
    const details = await openReplyTime();
    expect(
      Array.from(details.querySelectorAll("time")).map((time) => time.dateTime),
    ).toEqual([
      new Date(start).toISOString(),
      new Date(start + 12300).toISOString(),
    ]);
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    };
    expect(detailValue(details, "开始").textContent).toBe(
      new Date(start).toLocaleString("zh-CN", options),
    );
    expect(detailValue(details, "结束").textContent).toBe(
      new Date(start + 12300).toLocaleString("zh-CN", options),
    );
    expect(detailValue(details, "耗时").textContent).toBe("12 秒");
  });
  test("运行中打开的时间详情在本轮结束后保持打开并同步最终计时", async () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    await render(
      [message("a1", "assistant", [text("working")], { timestamp: start })],
      { status: "streaming" },
    );
    const details = await openReplyTime();
    expect(detailValue(details, "开始").querySelector("time")!.dateTime).toBe(
      new Date(start).toISOString(),
    );
    expect(detailValue(details, "结束").textContent).toBe("尚未结束");
    await render([
      message("a1", "assistant", [text("answer")], {
        timestamp: start,
        durationMs: 12300,
      }),
    ]);
    expect(document.querySelector('[role="dialog"]')).toBe(details);
    expect(detailValue(details, "结束").querySelector("time")!.dateTime).toBe(
      new Date(start + 12300).toISOString(),
    );
    expect(detailValue(details, "耗时").textContent).toBe("12 秒");
  });
  test("手机耗时入口打开内容高度的 sheet，关闭后恢复入口焦点", async () => {
    const original = window.matchMedia.bind(window);
    const media = original("(max-width: 767px)");
    Object.defineProperty(media, "matches", {
      configurable: true,
      value: true,
    });
    const mediaSpy = spyOn(window, "matchMedia").mockImplementation((query) =>
      query === media.media ? media : original(query),
    );
    const start = Date.parse("2026-01-01T00:00:00Z");
    try {
      await render([
        message("a1", "assistant", [text("answer")], {
          timestamp: start,
          durationMs: 12300,
        }),
      ]);
      const trigger = replyTimeButton();
      expect(trigger.textContent).toBe("耗时 12 秒");
      expect(container.querySelector("time")).toBeNull();
      trigger.focus();
      const details = await openReplyTime();
      expect(details.getAttribute("aria-modal")).toBe("true");
      expect(
        details.querySelector(
          '[data-sheet="true"][data-sheet-sizing="content"]',
        ),
      ).not.toBeNull();
      expect(
        Array.from(details.querySelectorAll("time")).map(
          (time) => time.dateTime,
        ),
      ).toEqual([
        new Date(start).toISOString(),
        new Date(start + 12300).toISOString(),
      ]);
      expect(detailValue(details, "耗时").textContent).toBe("12 秒");
      await click(details.querySelector('[aria-label="关闭"]')!);
      for (let frame = 0; frame < 10 && details.isConnected; frame++) {
        await act(async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
        });
      }
      expect(details.isConnected).toBe(false);
      expect(document.activeElement).toBe(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    } finally {
      await act(async () => root.render(null));
      mediaSpy.mockRestore();
    }
  });
  test("末条模型消息缺少耗时时保留时间详情入口，不使用条目时间补算", async () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    const first = message("a1", "assistant", [text("first")], {
      timestamp: start,
      durationMs: 2000,
    });
    const last = message("a2", "assistant", [text("last")], {
      timestamp: start + 10000,
    });
    last.timestamp = new Date(start + 15000).toISOString();
    await render([first, last]);
    expect(replyTimeButton().textContent).toBe("时间信息");
    const details = await openReplyTime();
    expect(details.querySelectorAll("time")).toHaveLength(1);
    expect(detailValue(details, "开始").querySelector("time")!.dateTime).toBe(
      new Date(start).toISOString(),
    );
    expect(detailValue(details, "结束").textContent).toBe("暂无数据");
    expect(detailValue(details, "耗时").textContent).toBe("暂无数据");
  });
  test("新轮次运行和自动压缩时历史轮次的结束时间与总耗时保持固定", async () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    const history = [
      message("u1", "user", "question"),
      message("a1", "assistant", [text("answer")], {
        timestamp: start,
        durationMs: 3000,
      }),
    ];
    await render(history);
    const selector = '[data-reply-key="reply:u1"]';
    const historyFooter = () =>
      container
        .querySelector(selector)!
        .parentElement!.querySelector(".conversation-reply-time")!;
    const fixedText = historyFooter().textContent;
    const next = [
      ...history,
      message("u2", "user", "next question"),
      message("a2", "assistant", [text("working")], {
        timestamp: start + 10000,
      }),
    ];
    for (const status of ["streaming", "compacting", "idle"] as const) {
      await render(next, { status });
      expect(historyFooter().textContent).toBe(fixedText);
      expect(replyTimeButton(historyFooter()).textContent).toBe("耗时 3 秒");
      const details = await openReplyTime(historyFooter());
      expect(
        Array.from(details.querySelectorAll("time")).map(
          (time) => time.dateTime,
        ),
      ).toEqual([
        new Date(start).toISOString(),
        new Date(start + 3000).toISOString(),
      ]);
      expect(detailValue(details, "耗时").textContent).toBe("3 秒");
      await click(replyTimeButton(historyFooter()));
      const currentFooter = container
        .querySelector('[data-reply-key="reply:u2"]')!
        .parentElement!.querySelector(".conversation-reply-time")!;
      expect(currentFooter.querySelector("time")).toBeNull();
      if (status === "idle") {
        expect(replyTimeButton(currentFooter).textContent).toBe("时间信息");
      } else {
        expect(replyTimeButton(currentFooter).textContent).toStartWith("耗时 ");
      }
    }
  });
  test("运行中耗时随单调时钟增长，结束和卸载时释放定时器", async () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    let monotonic = 100;
    let tick: (() => void) | undefined;
    const wallClock = spyOn(Date, "now").mockReturnValue(start + 1000);
    const clock = spyOn(performance, "now").mockImplementation(() => monotonic);
    const interval = spyOn(window, "setInterval").mockImplementation(((
      handler: Parameters<typeof window.setInterval>[0],
    ) => {
      tick = () => {
        if (typeof handler === "function") handler();
      };
      return 1;
    }) as typeof window.setInterval);
    const clear = spyOn(window, "clearInterval").mockImplementation(() => {});
    const entry = message("a1", "assistant", [text("answer")], {
      timestamp: start,
      durationMs: 3000,
    });
    try {
      await render([entry], { status: "streaming" });
      const footer = container.querySelector(".conversation-reply-time")!;
      expect(replyTimeButton(footer).textContent).toBe("耗时 1 秒");
      expect(interval).toHaveBeenCalledTimes(1);
      expect(interval.mock.calls[0]?.[1]).toBe(1000);
      expect(tick).toBeDefined();
      wallClock.mockReturnValue(start - 100000);
      monotonic += 1500;
      await act(async () => tick?.());
      expect(replyTimeButton(footer).textContent).toBe("耗时 2 秒");
      await render([entry]);
      expect(replyTimeButton(footer).textContent).toBe("耗时 3 秒");
      expect(clear).toHaveBeenCalledTimes(1);
      await render([entry], { status: "streaming" });
      expect(interval).toHaveBeenCalledTimes(2);
      await act(async () => root.render(null));
      expect(clear).toHaveBeenCalledTimes(2);
    } finally {
      await act(async () => root.render(null));
      wallClock.mockRestore();
      clock.mockRestore();
      interval.mockRestore();
      clear.mockRestore();
    }
  });
  test("耗时摘要显示整数秒且最小为一秒，长耗时省略零值单位", async () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    for (const [milliseconds, expected] of [
      [0, "1 秒"],
      [350, "1 秒"],
      [999, "1 秒"],
      [1000, "1 秒"],
      [1999, "1 秒"],
      [2000, "2 秒"],
      [12300, "12 秒"],
      [59999, "59 秒"],
      [60000, "1 分"],
      [133000, "2 分 13 秒"],
      [3600000, "1 小时"],
      [4080000, "1 小时 8 分"],
      [86400000, "1 天"],
      [97200000, "1 天 3 小时"],
    ] as const) {
      await render([
        message("a1", "assistant", [text("answer")], {
          timestamp: start,
          durationMs: milliseconds,
        }),
      ]);
      expect(replyTimeButton().textContent).toBe(`耗时 ${expected}`);
    }
    await act(async () => i18n.changeLanguage("en"));
    expect(replyTimeButton().textContent).toBe("Duration 1 d 3 h");
  });
  test("缺少或无效回复时间时省略时间入口", async () => {
    for (const timestamp of [undefined, NaN]) {
      await render([
        message("a1", "assistant", [text("answer")], { timestamp }),
      ]);
      expect(replyTimeButton()).toBeNull();
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    }
  });
});
