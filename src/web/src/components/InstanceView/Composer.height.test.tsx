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
let viewportWidth: number;
let previousHeight: PropertyDescriptor | undefined;
let previousWidth: PropertyDescriptor | undefined;
let sent: string[];

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  viewportHeight = 800;
  viewportWidth = 1024;
  previousHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  previousWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    get: () => viewportHeight,
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    get: () => viewportWidth,
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
  if (previousWidth) Object.defineProperty(window, "innerWidth", previousWidth);
  else Reflect.deleteProperty(window, "innerWidth");
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
  test("空白编辑区有默认高度和可访问的调节说明", async () => {
    await render();
    expect(editor().style.height).toBe("36px");
    expect(handle().getAttribute("aria-valuenow")).toBe("36");
    expect(handle().getAttribute("aria-valuemin")).toBe("36");
    expect(handle().getAttribute("aria-controls")).toBe(editor().id);
    expect(
      document.getElementById(handle().getAttribute("aria-describedby")!)!
        .textContent,
    ).toContain("Home");
    viewportWidth = 375;
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(editor().style.height).toBe("36px");
  });
  test("自动高度随文字增长，上限之后内部滚动", async () => {
    await render();
    let contentHeight = 240;
    Object.defineProperty(editor(), "scrollHeight", {
      configurable: true,
      get: () => contentHeight,
    });
    await text("content");
    expect(editor().style.height).toBe("240px");
    expect(editor().style.overflowY).toBe("hidden");
    contentHeight = 600;
    await text("long content");
    expect(editor().style.height).toBe("320px");
    expect(editor().style.overflowY).toBe("auto");
  });
  test("向上拖动增高，释放后继续输入与发送保留选择", async () => {
    await render();
    await pointer(handle(), "pointerdown", 300);
    await pointer(window, "pointermove", 220);
    expect(editor().style.height).toBe("116px");
    expect(handle().dataset.dragging).toBe("true");
    await pointer(window, "pointerup", 220);
    expect(handle().dataset.dragging).toBeUndefined();
    await pointer(window, "pointermove", 100);
    await text("hello");
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="发送"]')!
        .click(),
    );
    expect(sent).toEqual(["hello"]);
    expect(editor().value).toBe("");
    expect(editor().style.height).toBe("116px");
  });
  test("触摸拖动保持指针身份，并限制最小与最大高度", async () => {
    await render();
    await pointer(handle(), "pointerdown", 300, 7, "touch");
    await pointer(window, "pointermove", 100, 8, "touch");
    expect(editor().style.height).toBe("36px");
    await pointer(window, "pointermove", 900, 7, "touch");
    expect(editor().style.height).toBe("36px");
    await pointer(window, "pointermove", -900, 7, "touch");
    expect(editor().style.height).toBe("320px");
    await pointer(window, "pointerup", -900, 7, "touch");
  });
  test("取消指针与 Escape 恢复拖动开始时的高度模式", async () => {
    await render();
    await pointer(handle(), "pointerdown", 300);
    await pointer(window, "pointermove", 200);
    await pointer(window, "pointercancel", 200);
    expect(editor().style.height).toBe("36px");
    await key("ArrowUp");
    await pointer(handle(), "pointerdown", 300);
    await pointer(window, "pointermove", 200);
    await key("Escape");
    expect(editor().style.height).toBe("60px");
    expect(handle().dataset.dragging).toBeUndefined();
  });
  test("键盘与双击可调节或恢复自动高度", async () => {
    await render();
    expect((await key("ArrowUp")).defaultPrevented).toBe(true);
    expect(editor().style.height).toBe("60px");
    await key("ArrowDown");
    expect(editor().style.height).toBe("36px");
    await key("End");
    expect(editor().style.height).toBe("320px");
    await key("Home");
    expect(editor().style.height).toBe("36px");
    await key("ArrowUp");
    await act(async () =>
      handle().dispatchEvent(new MouseEvent("dblclick", { bubbles: true })),
    );
    expect(editor().style.height).toBe("36px");
  });
  test("可见空间减小时限制显示高度，恢复空间后保留手动选择", async () => {
    await render();
    await key("End");
    viewportHeight = 200;
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(editor().style.height).toBe("90px");
    expect(handle().getAttribute("aria-valuemax")).toBe("90");
    viewportHeight = 800;
    await act(async () => window.dispatchEvent(new Event("resize")));
    expect(editor().style.height).toBe("320px");
  });
  test("附件与工具栏占用空间参与高度上限计算", async () => {
    await render();
    Object.defineProperty(
      container.querySelector(".composer-surface")!,
      "getBoundingClientRect",
      { configurable: true, value: () => new DOMRect(0, 0, 500, 400) },
    );
    Object.defineProperty(editor(), "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 500, 36),
    });
    viewportHeight = 500;
    await act(async () => window.dispatchEvent(new Event("resize")));
    await key("End");
    expect(editor().style.height).toBe("56px");
  });
  test("visualViewport 高度变化调整上限并清理监听", async () => {
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
      expect(editor().style.height).toBe("135px");
      viewport.height = 500;
      await act(async () => viewport.dispatchEvent(new Event("resize")));
      await key("End");
      expect(editor().style.height).toBe("225px");
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
    await key("ArrowUp");
    await render("two");
    expect(editor().style.height).toBe("36px");
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
