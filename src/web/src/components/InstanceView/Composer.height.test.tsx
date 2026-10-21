import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { Composer } from "./Composer";
import i18n from "../../i18n";
import type { InputDraft } from "../../stores/useDrafts";
import type { InstanceInfo } from "../../../../protocol/types";

const instance: InstanceInfo = {
  id: "height",
  edgeId: "edge",
  hostname: "host",
  cwd: "/project",
  homedir: "/home",
  pid: 1,
  status: "idle",
  model: { provider: "provider", id: "model" },
  connectedAt: 0,
  lastHeartbeat: 0,
};
let root: Root;
let container: HTMLDivElement;
let viewportHeight: number;
let previousHeight: PropertyDescriptor | undefined;
let sent: string[];

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  viewportHeight = 800;
  previousHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    get: () => viewportHeight,
  });
  sent = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  if (previousHeight)
    Object.defineProperty(window, "innerHeight", previousHeight);
  else Reflect.deleteProperty(window, "innerHeight");
});
function Probe() {
  const [draft, setDraft] = useState<InputDraft>({ text: "", images: [] });
  return (
    <Composer
      instance={instance}
      draft={draft}
      onDraftChange={setDraft}
      onSendMessage={(text) => {
        sent.push(text);
        setDraft({ text: "", images: [] });
      }}
      onAbort={() => {}}
      onSetModel={() => {}}
      onSetThinkingLevel={() => {}}
      onCompact={() => {}}
      buttonMode="send"
      showCompactButton
      compactDisabled={false}
      onImageLightbox={() => {}}
      startBottomFollow={() => {}}
    />
  );
}
async function render(session = "one") {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <Probe key={session} />
      </MotionConfig>,
    ),
  );
}
function editor() {
  return container.querySelector("textarea")!;
}
function handle() {
  return container.querySelector<HTMLDivElement>('[role="separator"]')!;
}
async function pointer(
  target: EventTarget,
  type: string,
  y: number,
  pointerId = 1,
  pointerType = "mouse",
) {
  await act(async () =>
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        isPrimary: true,
        button: 0,
        pointerId,
        pointerType,
        clientY: y,
      }),
    ),
  );
}
async function key(value: string) {
  const event = new KeyboardEvent("keydown", {
    key: value,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => handle().dispatchEvent(event));
  return event;
}
async function text(value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!.call(editor(), value);
  await act(async () =>
    editor().dispatchEvent(new Event("input", { bubbles: true })),
  );
}

describe("输入区高度调节", () => {
  test("可见视口不足时限制自动高度，恢复后还原默认高度", async () => {
    await render();
    const initial = Number.parseFloat(editor().style.height);
    viewportHeight = 100;
    await act(async () => window.dispatchEvent(new Event("resize")));
    const maximum = Number(handle().getAttribute("aria-valuemax"));
    expect(maximum).toBeLessThan(initial);
    expect(Number.parseFloat(editor().style.height)).toBe(maximum);
    viewportHeight = 800;
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(Number.parseFloat(editor().style.height)).toBe(initial);
  });

  test("自动高度随内容增长，达到上限后内部滚动", async () => {
    await render();
    const initial = Number.parseFloat(editor().style.height);
    const maximum = Number(handle().getAttribute("aria-valuemax"));
    expect(initial).toBeGreaterThan(0);
    expect(handle().getAttribute("aria-controls")).toBe(editor().id);
    expect(Number(handle().getAttribute("aria-valuenow"))).toBe(initial);
    let contentHeight = Math.min(initial + 80, maximum);
    Object.defineProperty(editor(), "scrollHeight", {
      configurable: true,
      get: () => contentHeight,
    });
    await text("content");
    expect(Number.parseFloat(editor().style.height)).toBe(contentHeight);
    expect(editor().style.overflowY).toBe("hidden");
    contentHeight = maximum + 100;
    await text("long content");
    expect(Number.parseFloat(editor().style.height)).toBe(maximum);
    expect(editor().style.overflowY).toBe("auto");
  });

  test("拖动保持指针身份，输入与发送保留手动选择", async () => {
    await render();
    const initial = editor().style.height;
    await pointer(handle(), "pointerdown", 300, 7, "touch");
    await pointer(window, "pointermove", 100, 8, "touch");
    expect(editor().style.height).toBe(initial);
    await pointer(window, "pointermove", 220, 7, "touch");
    expect(Number.parseFloat(editor().style.height)).toBeGreaterThan(
      Number.parseFloat(initial),
    );
    const selected = editor().style.height;
    await pointer(window, "pointerup", 220, 7, "touch");
    await pointer(window, "pointermove", 100, 7, "touch");
    await text("hello");
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="发送"]')!
        .click(),
    );
    expect(sent).toEqual(["hello"]);
    expect(editor().value).toBe("");
    expect(editor().style.height).toBe(selected);
    expect(handle().dataset.dragging).toBeUndefined();
  });

  test("拖动限制到当前允许的高度范围", async () => {
    await render();
    const minimum = Number(handle().getAttribute("aria-valuemin"));
    const maximum = Number(handle().getAttribute("aria-valuemax"));
    await pointer(handle(), "pointerdown", 300);
    await pointer(window, "pointermove", 300 + maximum);
    expect(Number.parseFloat(editor().style.height)).toBe(minimum);
    await pointer(window, "pointermove", 300 - maximum);
    expect(Number.parseFloat(editor().style.height)).toBe(maximum);
    await pointer(window, "pointerup", 300 - maximum);
  });

  test("取消拖动恢复开始状态，键盘与双击恢复自动高度", async () => {
    await render();
    const initial = editor().style.height;
    await pointer(handle(), "pointerdown", 300);
    await pointer(window, "pointermove", 200);
    await pointer(window, "pointercancel", 200);
    expect(editor().style.height).toBe(initial);
    expect((await key("ArrowUp")).defaultPrevented).toBe(true);
    const manual = editor().style.height;
    expect(Number.parseFloat(manual)).toBeGreaterThan(
      Number.parseFloat(initial),
    );
    await pointer(handle(), "pointerdown", 300);
    await pointer(window, "pointermove", 200);
    await key("Escape");
    expect(editor().style.height).toBe(manual);
    expect(handle().dataset.dragging).toBeUndefined();
    await key("ArrowDown");
    expect(editor().style.height).toBe(initial);
    await key("End");
    expect(Number.parseFloat(editor().style.height)).toBe(
      Number(handle().getAttribute("aria-valuemax")),
    );
    await key("Home");
    expect(editor().style.height).toBe(initial);
    await key("ArrowUp");
    await act(async () =>
      handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
    );
    expect(editor().style.height).toBe(initial);
  });

  test("视口缩小时限制显示高度，恢复后保留手动选择", async () => {
    await render();
    await key("End");
    const selected = editor().style.height;
    viewportHeight = 200;
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(Number.parseFloat(editor().style.height)).toBeLessThan(
      Number.parseFloat(selected),
    );
    expect(Number.parseFloat(editor().style.height)).toBe(
      Number(handle().getAttribute("aria-valuemax")),
    );
    viewportHeight = 800;
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(editor().style.height).toBe(selected);
  });

  test("附件与工具栏占用空间参与高度上限计算", async () => {
    await render();
    const initial = Number.parseFloat(editor().style.height);
    Object.defineProperty(
      container.querySelector(".composer-surface")!,
      "getBoundingClientRect",
      { configurable: true, value: () => new DOMRect(0, 0, 500, 400) },
    );
    Object.defineProperty(editor(), "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 500, initial),
    });
    viewportHeight = 500;
    await act(async () => window.dispatchEvent(new Event("resize")));
    await key("End");
    expect(Number.parseFloat(editor().style.height)).toBeLessThanOrEqual(
      viewportHeight - (400 - initial),
    );
  });

  test("visualViewport 更新高度范围，卸载清理监听", async () => {
    const previous = Object.getOwnPropertyDescriptor(window, "visualViewport");
    const viewport = Object.assign(new EventTarget(), {
      height: 300,
      width: 375,
      offsetTop: 0,
      offsetLeft: 0,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });
    const remove = spyOn(viewport, "removeEventListener");
    try {
      await render();
      await key("End");
      const first = Number.parseFloat(editor().style.height);
      viewport.height = 500;
      await act(async () => viewport.dispatchEvent(new Event("resize")));
      await key("End");
      expect(Number.parseFloat(editor().style.height)).toBeGreaterThan(first);
      await act(async () => root.render(null));
      expect(remove.mock.calls.some(([event]) => event === "resize")).toBe(
        true,
      );
    } finally {
      await act(async () => root.render(null));
      remove.mockRestore();
      if (previous) Object.defineProperty(window, "visualViewport", previous);
      else Reflect.deleteProperty(window, "visualViewport");
    }
  });

  test("实例或 session 重建恢复默认高度", async () => {
    await render();
    const initial = editor().style.height;
    await key("ArrowUp");
    await render("two");
    expect(editor().style.height).toBe(initial);
  });

  test("拖动期间卸载清理指针与键盘监听", async () => {
    await render();
    const remove = spyOn(window, "removeEventListener");
    try {
      await pointer(handle(), "pointerdown", 300);
      await act(async () => root.render(null));
      for (const type of [
        "pointermove",
        "pointerup",
        "pointercancel",
        "keydown",
        "blur",
        "resize",
      ]) {
        expect(remove.mock.calls.some(([event]) => event === type)).toBe(true);
      }
      await pointer(window, "pointermove", 200);
      expect(container.querySelector("textarea") === null).toBe(true);
    } finally {
      remove.mockRestore();
    }
  });
});
