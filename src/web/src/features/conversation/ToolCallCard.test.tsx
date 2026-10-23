import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { MotionConfig } from "motion/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import i18n from "../../i18n";
import { ToolCallCard as ToolCard } from "./ToolCallCard";
import type { SessionEntry, ToolExecutionState } from "./types";
import { useConversationDisplay } from "./useConversationDisplay";

function ToolCallCard({
  name,
  args,
  toolCallId = "call-1",
  entries,
  execution,
  isAborted = false,
}: {
  name: string;
  args: Record<string, unknown>;
  toolCallId?: string;
  entries: SessionEntry[];
  execution?: ToolExecutionState;
  isAborted?: boolean;
}) {
  const call: SessionEntry = {
    type: "message",
    id: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: toolCallId, name, arguments: args }],
      stopReason: isAborted ? "aborted" : undefined,
    },
  };
  const items = useConversationDisplay(
    [
      call,
      ...entries.map((entry, index) => ({
        ...entry,
        id: entry.id ?? `result-${index}`,
      })),
    ],
    execution ? new Map([[toolCallId, execution]]) : new Map(),
    null,
    "streaming",
  );
  const reply = items.find((item) => item.type === "reply");
  const part = reply?.parts.find((part) => part.type === "execution");
  const tool = part?.items.find((item) => item.type === "tool");
  if (!tool) throw new Error("Expected tool display data");
  return (
    <ToolCard
      name={name}
      args={args}
      toolCallId={toolCallId}
      presentation={tool.presentation}
    />
  );
}

let root: Root | undefined;
let container: HTMLElement;
let mountPoint: HTMLDivElement;

async function renderCard(
  execution?: ToolExecutionState,
  entries: SessionEntry[] = [],
  name = "bash",
  args: Record<string, unknown> = { command: "echo hello" },
) {
  if (!root) {
    mountPoint = document.createElement("div");
    document.body.append(mountPoint);
    container = document.body;
    root = createRoot(mountPoint);
  }
  await act(async () => {
    root!.render(
      <MotionConfig reducedMotion="always">
        <ToolCallCard
          name={name}
          args={args}
          toolCallId="call-1"
          entries={entries}
          execution={execution}
        />
      </MotionConfig>,
    );
  });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  await act(async () => i18n.changeLanguage("zh-CN"));
  root = undefined;
  mountPoint?.remove();
});

describe("ToolCallCard lifecycle", () => {
  test("shows partial output while retaining running status and an open modal", async () => {
    await renderCard({
      status: "running",
      partialResult: { content: [{ type: "text", text: "first output" }] },
    });
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("first output");
    expect(
      container
        .querySelector('.modal-header [data-tool-status="running"]')
        ?.getAttribute("aria-label"),
    ).toContain("执行中");
    await renderCard({
      status: "running",
      partialResult: { content: [{ type: "text", text: "latest output" }] },
    });
    expect(container.textContent).toContain("latest output");
    expect(container.textContent).not.toContain("first output");
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  test("shows errors and duration before the history result arrives", async () => {
    await renderCard({
      status: "completed",
      result: { content: [{ type: "text", text: "command failed" }] },
      isError: true,
      durationMs: 1200,
    });
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(container.textContent).toContain("1.2\u00a0s");
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("command failed");
    expect(container.querySelector("pre.tool-result-error") !== null).toBe(
      true,
    );
  });

  test("uses final history content and tolerates legacy results", async () => {
    const entries: SessionEntry[] = [
      {
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          content: [{ type: "text", text: "history output" }],
          isError: false,
        },
      },
    ];
    await renderCard(
      {
        status: "running",
        partialResult: { content: [{ type: "text", text: "partial" }] },
      },
      entries,
    );
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(container.querySelector('[title="执行耗时"]')).toBeNull();
    expect(container.querySelector('[title="调用等待时间"]')).toBeNull();
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("history output");
    expect(container.textContent).not.toContain("partial");
  });

  test("renders saved execution duration and an aborted call", async () => {
    const entries: SessionEntry[] = [
      {
        type: "message",
        message: {
          role: "toolResult",
          toolCallId: "call-1",
          content: [],
          durationMs: 2500,
          isError: false,
        },
      },
    ];
    await renderCard(undefined, entries);
    expect(container.textContent).toContain("2.5\u00a0s");
    await act(async () =>
      root!.render(
        <ToolCallCard name="bash" args={{}} entries={[]} isAborted />,
      ),
    );
    expect(container.querySelector(".animate-spin")).toBeNull();
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("已终止");
  });

  test("does not infer elapsed time after a missed start event", async () => {
    await renderCard({ status: "running", partialResult: { content: [] } });
    expect(container.querySelector('[title="调用等待时间"]')).toBeNull();
    await renderCard({
      status: "completed",
      result: { content: [] },
      isError: false,
    });
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(container.querySelector('[title="执行耗时"]')).toBeNull();
  });

  test("formats short durations in milliseconds and hides zero duration", async () => {
    await renderCard({
      status: "completed",
      result: { content: [] },
      isError: false,
      durationMs: 12.4,
    });
    expect(container.textContent).toContain("12\u00a0ms");
    expect(container.textContent).not.toContain("0.0\u00a0s");
    await renderCard({
      status: "completed",
      result: { content: [] },
      isError: false,
      durationMs: 0.2,
    });
    expect(container.textContent).toContain("1\u00a0ms");
    await renderCard({
      status: "completed",
      result: { content: [] },
      isError: false,
      durationMs: 0,
    });
    expect(container.querySelector('[title="执行耗时"]')).toBeNull();
  });

  test("uses the same duration in the bash card and detail header", async () => {
    await renderCard();
    await act(async () =>
      root!.render(
        <ToolCallCard
          name="bash"
          args={{ command: "echo hello", timeout: 60 }}
          entries={[]}
          execution={{
            status: "completed",
            result: { content: [] },
            isError: false,
            durationMs: 1200,
          }}
        />,
      ),
    );
    await act(async () => container.querySelector("button")!.click());
    const durations = container.querySelectorAll('[title="执行耗时"]');
    expect(durations.length).toBe(2);
    expect(durations[0].textContent).toBe(durations[1].textContent);
    expect(container.textContent).toContain("超时时间: 60\u00a0s");
  });

  test("keeps units identical across languages and translates the timeout label", async () => {
    await renderCard();
    await act(async () =>
      root!.render(
        <ToolCallCard
          name="bash"
          args={{ command: "echo hello", timeout: 60 }}
          entries={[]}
          execution={{
            status: "completed",
            result: { content: [] },
            isError: false,
            durationMs: 12,
          }}
        />,
      ),
    );
    await act(async () => container.querySelector("button")!.click());
    const duration = container.querySelector('[title="执行耗时"]')!.textContent;
    await act(async () => i18n.changeLanguage("en"));
    expect(
      container.querySelector('[title="Execution duration"]')!.textContent,
    ).toBe(duration);
    expect(container.textContent).toContain("Timeout: 60\u00a0s");
  });

  test("omits the timeout label when no timeout was supplied", async () => {
    await renderCard({
      status: "completed",
      result: { content: [] },
      isError: false,
      durationMs: 1200,
    });
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).not.toContain("超时时间");
  });

  test("shares monotonic elapsed time and stops timing after completion", async () => {
    let now = 1000;
    let tick: (() => void) | undefined;
    const clock = spyOn(performance, "now").mockImplementation(() => now);
    const wallClock = spyOn(Date, "now").mockReturnValue(100_000);
    const interval = spyOn(globalThis, "setInterval").mockImplementation(((
      callback: TimerHandler,
    ) => {
      tick = callback as () => void;
      return 1;
    }) as typeof setInterval);
    const clear = spyOn(globalThis, "clearInterval").mockImplementation(
      () => {},
    );
    try {
      await renderCard({
        status: "running",
        startedAt: 0,
        partialResult: { content: [] },
      });
      await act(async () => container.querySelector("button")!.click());
      expect(interval).toHaveBeenCalledTimes(1);
      const expectSharedDuration = (title: string, text: string) => {
        const durations = container.querySelectorAll(`[title="${title}"]`);
        expect(durations.length).toBe(2);
        expect(durations[0].textContent).toBe(text);
        expect(durations[1].textContent).toBe(text);
      };
      expectSharedDuration("调用等待时间", "1.0\u00a0s");
      now = 2500;
      wallClock.mockReturnValue(-100_000);
      await act(async () => tick!());
      expectSharedDuration("调用等待时间", "2.5\u00a0s");
      await renderCard({
        status: "completed",
        result: { content: [] },
        isError: false,
        durationMs: 1200,
      });
      expect(clear).toHaveBeenCalledWith(1);
      expectSharedDuration("执行耗时", "1.2\u00a0s");
      now = 10_000;
      await act(async () => tick!());
      expectSharedDuration("执行耗时", "1.2\u00a0s");
      expect(interval).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[title="调用等待时间"]')).toBeNull();
    } finally {
      clock.mockRestore();
      wallClock.mockRestore();
      interval.mockRestore();
      clear.mockRestore();
    }
  });

  test("clears the running timer on abort and unmount", async () => {
    const interval = spyOn(globalThis, "setInterval").mockReturnValue(
      1 as unknown as ReturnType<typeof setInterval>,
    );
    const clear = spyOn(globalThis, "clearInterval").mockImplementation(
      () => {},
    );
    try {
      await renderCard({
        status: "running",
        startedAt: performance.now() - 1000,
      });
      await act(async () =>
        root!.render(
          <ToolCallCard name="bash" args={{}} entries={[]} isAborted />,
        ),
      );
      expect(clear).toHaveBeenCalledTimes(1);
      expect(container.querySelector('[title="调用等待时间"]')).toBeNull();
      await renderCard({
        status: "running",
        startedAt: performance.now() - 1000,
      });
      await act(async () => root!.unmount());
      root = undefined;
      expect(clear).toHaveBeenCalledTimes(2);
    } finally {
      interval.mockRestore();
      clear.mockRestore();
    }
  });

  test("Edit 详情保留历史结果中的 diff", async () => {
    await renderCard(
      undefined,
      [
        {
          type: "message",
          message: {
            role: "toolResult",
            toolCallId: "call-1",
            content: [{ type: "text", text: "updated" }],
            isError: false,
            details: { diff: "+ added\n- removed" },
          },
        },
      ],
      "edit",
      { path: "/project/example.ts" },
    );
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("/project/example.ts");
    expect(container.textContent).toContain("+ added");
    expect(container.textContent).toContain("- removed");
  });

  test("Read 详情根据路径展示 Markdown 结果", async () => {
    await renderCard(
      {
        status: "completed",
        result: { content: [{ type: "text", text: "# Document" }] },
        isError: false,
      },
      [],
      "read",
      { path: "/project/README.md", offset: 2, limit: 3 },
    );
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("/project/README.md [2:4]");
    expect(container.querySelector("h1")?.textContent).toBe("Document");
  });

  test("Write 详情保留写入内容与最终结果", async () => {
    await renderCard(
      {
        status: "completed",
        result: { content: [{ type: "text", text: "saved" }] },
        isError: false,
      },
      [],
      "write",
      { path: "/project/example.ts", content: "const value = 1;" },
    );
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("const value = 1;");
    expect(container.textContent).toContain("saved");
  });

  test("renders partial output for custom tools", async () => {
    await renderCard(
      {
        status: "running",
        partialResult: { content: [{ type: "text", text: "progress update" }] },
      },
      [],
      "custom",
    );
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("progress update");
    expect(
      container
        .querySelector('.modal-header [data-tool-status="running"]')
        ?.getAttribute("aria-label"),
    ).toContain("执行中");
  });
});
