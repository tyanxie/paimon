import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionConfig } from "motion/react";
import i18n from "../../i18n";
import { ModalShell, shouldDismissSheet } from "./ModalShell";
import { ImageLightbox } from "./ImageLightbox";

let root: Root;
let mountPoint: HTMLDivElement;
let trigger: HTMLButtonElement;
let closeCount: number;
let mobile: boolean;
let mediaQuery: MediaQueryList;
let mediaSpy: ReturnType<typeof spyOn>;
let showSpy: ReturnType<typeof spyOn>;
let overflow: string;

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  mountPoint = document.createElement("div");
  trigger = document.createElement("button");
  document.body.append(mountPoint, trigger);
  trigger.focus();
  root = createRoot(mountPoint);
  closeCount = 0;
  mobile = false;
  overflow = document.body.style.overflow;
  document.body.style.overflow = "auto";
  const original = window.matchMedia.bind(window);
  mediaQuery = original("(max-width: 767px)");
  Object.defineProperty(mediaQuery, "matches", {
    configurable: true,
    get: () => mobile,
  });
  mediaSpy = spyOn(window, "matchMedia").mockImplementation((query) =>
    query === mediaQuery.media ? mediaQuery : original(query),
  );
  showSpy = spyOn(window.HTMLDialogElement.prototype, "showModal");
});
afterEach(async () => {
  await act(async () => root.unmount());
  mountPoint.remove();
  trigger.remove();
  mediaSpy.mockRestore();
  showSpy.mockRestore();
  document.body.style.overflow = overflow;
  await i18n.changeLanguage("zh-CN");
});

// 功能测试直接控制挂载，动画与真实手势由用户检查。
async function render({
  open = true,
  content = <p>tool output</p>,
  mobileSheet = true,
  strict = false,
}: {
  open?: boolean;
  content?: ReactNode;
  mobileSheet?: boolean;
  strict?: boolean;
} = {}) {
  const view = (
    <MotionConfig reducedMotion="always">
      {open && (
        <ModalShell
          title={<span>bash</span>}
          trailing={<span>1.2 s</span>}
          onClose={() => closeCount++}
          mobileSheet={mobileSheet}
        >
          {content}
        </ModalShell>
      )}
    </MotionConfig>
  );
  await act(async () =>
    root.render(strict ? <StrictMode>{view}</StrictMode> : view),
  );
}
function dialog() {
  return document.querySelector<HTMLDialogElement>("dialog.modal-viewport")!;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
}

describe("详情窗口功能", () => {
  test("Portal 打开命名的原生 dialog，并聚焦标题", async () => {
    await render();
    const window = dialog();
    expect(window.parentElement === document.body).toBe(true);
    expect(window.open).toBe(true);
    expect(showSpy).toHaveBeenCalledTimes(1);
    expect(window.getAttribute("aria-modal")).toBe("true");
    expect(
      document.getElementById(window.getAttribute("aria-labelledby")!)!
        .textContent,
    ).toBe("bash");
    expect(
      document.activeElement ===
        document.getElementById(window.getAttribute("aria-labelledby")!),
    ).toBe(true);
    expect(window.querySelector("header")!.textContent).toContain("1.2 s");
    expect(
      window.querySelector('[role="region"]')!.getAttribute("aria-label"),
    ).toBe("详情内容");
    expect(mountPoint.querySelector("dialog") === null).toBe(true);
  });
  test("手机详情与居中弹窗使用标题作为初始焦点", async () => {
    mobile = true;
    for (const mobileSheet of [true, false]) {
      await render({ open: false });
      await render({ mobileSheet });
      const title = document.getElementById(
        dialog().getAttribute("aria-labelledby")!,
      )!;
      expect(document.activeElement === title).toBe(true);
      expect(title.tabIndex).toBe(-1);
    }
  });
  test("标题焦点通过 Tab 与 Shift+Tab 进入窗口控件", async () => {
    await render({ content: <button data-last>copy</button> });
    const title = document.activeElement as HTMLElement;
    const first = dialog().querySelector<HTMLButtonElement>(".modal-close")!;
    const last = dialog().querySelector<HTMLButtonElement>("[data-last]")!;
    for (const shiftKey of [false, true]) {
      title.focus();
      title.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey,
          bubbles: true,
          cancelable: true,
        }),
      );
      expect(document.activeElement === (shiftKey ? last : first)).toBe(true);
    }
  });
  test("图片预览聚焦说明并支持键盘进入关闭入口", async () => {
    await act(async () =>
      root.render(
        <MotionConfig reducedMotion="always">
          <ImageLightbox src="data:image/png;base64,AA==" onClose={() => {}} />
        </MotionConfig>,
      ),
    );
    const preview = document.querySelector<HTMLDialogElement>(
      "dialog.image-lightbox",
    )!;
    const description = preview.querySelector("span[tabindex='-1']")!;
    expect(document.activeElement === description).toBe(true);
    description.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement === preview.querySelector("button")).toBe(
      true,
    );
  });
  test("结果更新保留窗口、内容、焦点和阅读位置", async () => {
    await render();
    const window = dialog();
    const content = window.querySelector<HTMLDivElement>(".modal-content")!;
    content.scrollTop = 500;
    content.scrollLeft = 40;
    content.focus();
    await render({ content: <p>final output</p> });
    expect(dialog() === window).toBe(true);
    expect(window.querySelector(".modal-content") === content).toBe(true);
    expect(content.textContent).toBe("final output");
    expect(content.scrollTop).toBe(500);
    expect(content.scrollLeft).toBe(40);
    expect(document.activeElement === content).toBe(true);
    expect(showSpy).toHaveBeenCalledTimes(1);
  });
  test("关闭入口请求关闭，卸载后恢复滚动与入口焦点", async () => {
    await render();
    const window = dialog();
    await click(window.querySelector<HTMLButtonElement>(".modal-close")!);
    expect(closeCount).toBe(1);
    await render({ open: false });
    expect(window.open).toBe(false);
    expect(window.isConnected).toBe(false);
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement === trigger).toBe(true);
  });
  test("原生 cancel 请求关闭并阻止浏览器提前关闭窗口", async () => {
    await render();
    const event = new Event("cancel", { cancelable: true });
    await act(async () => dialog().dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(closeCount).toBe(1);
    expect(dialog().open).toBe(true);
  });
  test("入口移除后仍释放背景滚动限制", async () => {
    await render();
    trigger.remove();
    await render({ open: false });
    expect(dialog() === null).toBe(true);
    expect(document.body.style.overflow).toBe("auto");
  });
  test("StrictMode 正确管理原生窗口与背景滚动", async () => {
    await render({ strict: true });
    expect(dialog().open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => root.render(null));
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement === trigger).toBe(true);
  });
  test("Tab 循环忽略隐藏、禁用和 inert 控件", async () => {
    await render({
      content: (
        <>
          <input aria-label="query" />
          <button data-last>copy</button>
          <button disabled>disabled</button>
          <button hidden>hidden</button>
          <div inert>
            <button>inert</button>
          </div>
        </>
      ),
    });
    const first = dialog().querySelector<HTMLButtonElement>(".modal-close")!;
    const last = dialog().querySelector<HTMLButtonElement>("[data-last]")!;
    first.focus();
    first.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement === last).toBe(true);
    last.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement === first).toBe(true);
  });
  test("内容点击保持窗口，独立的遮罩点击请求关闭", async () => {
    await render();
    const panel = dialog().querySelector<HTMLDivElement>(".modal-panel")!;
    const positioner =
      dialog().querySelector<HTMLDivElement>(".modal-positioner")!;
    await click(panel);
    expect(closeCount).toBe(0);
    panel.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await click(positioner);
    expect(closeCount).toBe(0);
    positioner.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    await click(positioner);
    expect(closeCount).toBe(1);
  });
  test("断点变化保留窗口与内容阅读位置", async () => {
    mobile = true;
    await render();
    const panel = dialog().querySelector(".modal-panel")!;
    const content = dialog().querySelector<HTMLDivElement>(".modal-content")!;
    content.scrollTop = 300;
    expect(panel.getAttribute("data-sheet")).toBe("true");
    expect(dialog().querySelector(".modal-grabber") !== null).toBe(true);
    mobile = false;
    await act(async () => mediaQuery.dispatchEvent(new Event("change")));
    expect(panel.getAttribute("data-sheet")).toBe("false");
    expect(content.scrollTop).toBe(300);
    expect(showSpy).toHaveBeenCalledTimes(1);
  });
  test("表单保留居中展示与输入值", async () => {
    mobile = true;
    await render({
      mobileSheet: false,
      content: <textarea defaultValue="instructions" />,
    });
    expect(
      dialog().querySelector(".modal-panel")!.getAttribute("data-sheet"),
    ).toBe("false");
    expect(dialog().querySelector(".modal-grabber") === null).toBe(true);
    expect(dialog().querySelector("textarea")!.value).toBe("instructions");
  });
  test("预览卸载后恢复详情焦点并保留背景滚动限制", async () => {
    const content = (preview: boolean) => (
      <>
        <button data-preview>preview</button>
        {preview && (
          <ImageLightbox src="data:image/png;base64,AA==" onClose={() => {}} />
        )}
      </>
    );
    await render({ content: content(false) });
    const parent = dialog();
    const opener = parent.querySelector<HTMLButtonElement>("[data-preview]")!;
    opener.focus();
    await render({ content: content(true) });
    await render({ content: content(false) });
    expect(parent.open).toBe(true);
    expect(document.activeElement === opener).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    await render({ open: false });
    expect(document.body.style.overflow).toBe("auto");
  });
  test("关闭与内容说明提供英文文本", async () => {
    await i18n.changeLanguage("en");
    await render();
    expect(dialog().querySelector('[aria-label="Close"]') !== null).toBe(true);
    expect(
      dialog().querySelector('[aria-label="Dialog content"]') !== null,
    ).toBe(true);
  });
});

describe("手机 sheet 关闭条件", () => {
  const gesture = (x: number, y: number, velocity = 0) => ({
    offset: { x, y },
    velocity: { x: 0, y: velocity },
  });
  test("明确的下滑距离或向下速度请求关闭", () => {
    expect(shouldDismissSheet(gesture(0, 150), 800)).toBe(true);
    expect(shouldDismissSheet(gesture(5, 45, 650), 800)).toBe(true);
  });
  test("向上、横向和短距离保持窗口", () => {
    expect(shouldDismissSheet(gesture(0, -200), 800)).toBe(false);
    expect(shouldDismissSheet(gesture(200, 150), 800)).toBe(false);
    expect(shouldDismissSheet(gesture(0, 30, 650), 800)).toBe(false);
    expect(shouldDismissSheet(gesture(0, 60, 100), 800)).toBe(false);
  });
  test("较矮窗口仍要求明确的下滑距离", () => {
    expect(shouldDismissSheet(gesture(0, 80), 300)).toBe(true);
    expect(shouldDismissSheet(gesture(0, 60), 300)).toBe(false);
  });
});
