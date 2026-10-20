import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AnimatePresence, MotionConfig } from "motion/react";
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

async function render({
  open = true,
  content = <p>tool output</p>,
  mobileSheet = true,
  reduced = false,
  strict = false,
}: {
  open?: boolean;
  content?: ReactNode;
  mobileSheet?: boolean;
  reduced?: boolean;
  strict?: boolean;
} = {}) {
  const view = (
    <MotionConfig reducedMotion={reduced ? "always" : "user"}>
      <AnimatePresence>
        {open && (
          <ModalShell
            key="detail"
            title={<span>bash</span>}
            trailing={<span>1.2 s</span>}
            onClose={() => closeCount++}
            mobileSheet={mobileSheet}
          >
            {content}
          </ModalShell>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
  await act(async () =>
    root.render(strict ? <StrictMode>{view}</StrictMode> : view),
  );
}

async function swipe(element: HTMLElement, cancelled = false) {
  const pointer = (type: string, y: number) => {
    const event = new PointerEvent(type, {
      bubbles: true,
      pointerId: 1,
      pointerType: "touch",
      isPrimary: true,
      button: 0,
      clientX: 100,
      clientY: y,
    });
    Object.defineProperties(event, {
      pageX: { value: 100 },
      pageY: { value: y },
    });
    return event;
  };
  await act(async () => element.dispatchEvent(pointer("pointerdown", 100)));
  await act(async () => {
    window.dispatchEvent(pointer("pointermove", 300));
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  await act(async () => {
    window.dispatchEvent(
      pointer(cancelled ? "pointercancel" : "pointerup", 300),
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

function dialog() {
  return document.querySelector<HTMLDialogElement>("dialog.modal-viewport")!;
}
async function finishExit() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
}

describe("详情窗口生命周期", () => {
  test("通过 Portal 和 showModal 打开命名 dialog，聚焦关闭入口", async () => {
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
      document.activeElement === window.querySelector(".modal-close"),
    ).toBe(true);
    expect(window.querySelector("header")!.textContent).toContain("1.2 s");
    expect(
      window.querySelector('[role="region"]')!.getAttribute("aria-label"),
    ).toBe("详情内容");
    expect(mountPoint.querySelector("dialog") === null).toBe(true);
  });

  test("标题与关闭入口位于独立滚动内容之外", async () => {
    await render();
    const content = dialog().querySelector(".modal-content")!;
    expect(content.classList.contains("overflow-auto")).toBe(true);
    expect(content.classList.contains("min-h-0")).toBe(true);
    expect(content.contains(dialog().querySelector("header"))).toBe(false);
    expect(
      dialog().querySelector("header")!.classList.contains("shrink-0"),
    ).toBe(true);
  });

  test("结果更新保留窗口、内容区域、焦点和阅读位置", async () => {
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

  test("关闭请求后保留退出窗口，结束后恢复背景滚动与入口焦点", async () => {
    await render();
    const window = dialog();
    await click(window.querySelector<HTMLButtonElement>(".modal-close")!);
    expect(closeCount).toBe(1);
    await render({ open: false });
    expect(window.isConnected).toBe(true);
    expect(window.open).toBe(true);
    expect(window.getAttribute("data-presence")).toBe("exiting");
    expect(window.querySelector(".modal-interior")!.hasAttribute("inert")).toBe(
      true,
    );
    expect(document.body.style.overflow).toBe("hidden");
    await click(window.querySelector<HTMLButtonElement>(".modal-close")!);
    expect(closeCount).toBe(1);
    await finishExit();
    expect(window.isConnected).toBe(false);
    expect(window.open).toBe(false);
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement === trigger).toBe(true);
  });

  test("原生 cancel 事件请求关闭并保留动画生命周期", async () => {
    await render();
    const event = new Event("cancel", { cancelable: true });
    await act(async () => dialog().dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(closeCount).toBe(1);
    expect(dialog().open).toBe(true);
  });

  test("退出期间再次打开，继续使用同一个窗口并保留阅读位置", async () => {
    await render();
    const window = dialog();
    const content = window.querySelector<HTMLDivElement>(".modal-content")!;
    content.scrollTop = 300;
    await render({ open: false });
    await render();
    await finishExit();
    expect(dialog() === window).toBe(true);
    expect(window.getAttribute("data-presence")).toBe("present");
    expect(window.querySelector(".modal-interior")!.hasAttribute("inert")).toBe(
      false,
    );
    expect(content.scrollTop).toBe(300);
    expect(showSpy).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe("hidden");
  });

  test("减少动态效果时直接完成关闭", async () => {
    mobile = true;
    await render({ reduced: true });
    expect(
      dialog().querySelector<HTMLElement>(".modal-panel")!.style.transform,
    ).not.toContain("0.96");
    await render({ open: false, reduced: true });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(document.querySelector("dialog.modal-viewport") === null).toBe(true);
    expect(document.body.style.overflow).toBe("auto");
  });

  test("父组件卸载时关闭原生窗口并释放滚动限制", async () => {
    await render();
    const window = dialog();
    await act(async () => root.render(null));
    expect(window.open).toBe(false);
    expect(window.isConnected).toBe(false);
    expect(document.body.style.overflow).toBe("auto");
  });

  test("入口已经移除时仍可完成关闭", async () => {
    await render();
    trigger.remove();
    await render({ open: false });
    await finishExit();
    expect(document.querySelector("dialog.modal-viewport") === null).toBe(true);
    expect(document.body.style.overflow).toBe("auto");
  });

  test("StrictMode 下正确释放并重新建立原生模态状态", async () => {
    await render({ strict: true });
    expect(dialog().open).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => root.render(null));
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement === trigger).toBe(true);
  });
});

describe("详情窗口操作", () => {
  test("Tab 在可用控件之间循环，隐藏与禁用控件保持不可访问", async () => {
    await render({
      content: (
        <>
          <input aria-label="query" />
          <a href="#result">result</a>
          <button data-last>copy</button>
          <button disabled>disabled</button>
          <button hidden>hidden</button>
          <button style={{ display: "none" }}>hidden by style</button>
          <div inert>
            <button>inert</button>
          </div>
        </>
      ),
    });
    const first = dialog().querySelector<HTMLButtonElement>(".modal-close")!;
    const last = dialog().querySelector<HTMLButtonElement>("[data-last]")!;
    first.focus();
    const backwards = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    first.dispatchEvent(backwards);
    expect(backwards.defaultPrevented).toBe(true);
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

  test("内容点击与从内容开始的指针操作保持窗口，遮罩点击请求关闭", async () => {
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

  test("遮罩与面板分别位于固定窗口内，手机进出保留面板透明度", async () => {
    mobile = true;
    await render();
    const window = dialog();
    const overlay = window.querySelector<HTMLElement>(".modal-overlay")!;
    const positioner = window.querySelector<HTMLElement>(".modal-positioner")!;
    const panel = window.querySelector<HTMLElement>(".modal-panel")!;
    expect(overlay.parentElement === window).toBe(true);
    expect(positioner.parentElement === window).toBe(true);
    expect(panel.parentElement === positioner).toBe(true);
    expect(overlay.contains(panel)).toBe(false);
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(overlay.classList.contains("pointer-events-none")).toBe(true);
    expect(positioner.getAttribute("data-sheet")).toBe("true");
    expect(positioner.style.opacity).toBe("");
    expect(panel.style.opacity).toBe("1");
    await render({ open: false });
    expect(window.isConnected).toBe(true);
    expect(panel.style.opacity).toBe("1");
    expect(positioner.style.opacity).toBe("");
    await finishExit();
    expect(window.isConnected).toBe(false);
  });

  test("详情窗口与定位区域使用不可滚动的范围，内容区域独立滚动", async () => {
    const css = await Bun.file(
      new URL("../../index.css", import.meta.url),
    ).text();
    expect(css).toContain(
      ".modal-viewport {\n  background: transparent;\n  overflow: clip;\n}",
    );
    expect(css).toContain(".modal-positioner {\n  overflow: clip;\n}");
    expect(css).toContain(
      '.modal-positioner[data-sheet="true"] {\n  align-items: flex-end;',
    );
    await render();
    const positioner =
      dialog().querySelector<HTMLElement>(".modal-positioner")!;
    expect(positioner.classList.contains("absolute")).toBe(true);
    expect(positioner.classList.contains("inset-0")).toBe(true);
    expect(
      positioner
        .querySelector(".modal-content")!
        .classList.contains("overflow-auto"),
    ).toBe(true);
  });

  test("手机展示顶部拖动区域，窗口宽度变化时保持内容与阅读位置", async () => {
    mobile = true;
    await render();
    const panel = dialog().querySelector(".modal-panel")!;
    const content = dialog().querySelector<HTMLDivElement>(".modal-content")!;
    content.scrollTop = 300;
    expect(panel.getAttribute("data-sheet")).toBe("true");
    expect(dialog().querySelector(".modal-grabber") !== null).toBe(true);
    expect(content.contains(dialog().querySelector(".modal-grabber"))).toBe(
      false,
    );
    mobile = false;
    await act(async () => mediaQuery.dispatchEvent(new Event("change")));
    expect(panel.getAttribute("data-sheet")).toBe("false");
    expect(dialog().querySelector(".modal-grabber") === null).toBe(true);
    expect(content.scrollTop).toBe(300);
    expect(showSpy).toHaveBeenCalledTimes(1);
  });

  test("正文指针操作保留滚动，顶部拖动区域支持下滑关闭", async () => {
    mobile = true;
    await render();
    await finishExit();
    await swipe(dialog().querySelector<HTMLElement>(".modal-content")!);
    expect(closeCount).toBe(0);
    await swipe(dialog().querySelector<HTMLElement>(".modal-grabber")!);
    expect(closeCount).toBe(1);
  });

  test("取消顶部拖动时保持窗口", async () => {
    mobile = true;
    await render();
    await finishExit();
    await swipe(dialog().querySelector<HTMLElement>(".modal-grabber")!, true);
    expect(closeCount).toBe(0);
  });

  test("减少动态效果时保留顶部下滑关闭手势", async () => {
    mobile = true;
    await render({ reduced: true });
    await finishExit();
    await swipe(dialog().querySelector<HTMLElement>(".modal-grabber")!);
    expect(closeCount).toBe(1);
  });

  test("表单窗口保留居中展示和输入能力", async () => {
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

  test("预览关闭后恢复详情焦点，保持详情及背景滚动限制", async () => {
    let previewCloses = 0;
    const content = (preview: boolean) => (
      <>
        <button data-preview>preview</button>
        <AnimatePresence>
          {preview && (
            <ImageLightbox
              key="image"
              src="data:image/png;base64,AA=="
              onClose={() => previewCloses++}
            />
          )}
        </AnimatePresence>
      </>
    );
    await render({ content: content(false) });
    const parent = dialog();
    const opener = parent.querySelector<HTMLButtonElement>("[data-preview]")!;
    opener.focus();
    await render({ content: content(true) });
    const preview = document.querySelector<HTMLDialogElement>(
      "dialog.image-lightbox",
    )!;
    await act(async () =>
      preview.dispatchEvent(
        new Event("cancel", { bubbles: true, cancelable: true }),
      ),
    );
    expect(previewCloses).toBe(1);
    expect(closeCount).toBe(0);
    await render({ content: content(false) });
    expect(document.body.style.overflow).toBe("hidden");
    await finishExit();
    expect(preview.isConnected).toBe(false);
    expect(parent.open).toBe(true);
    expect(document.activeElement === opener).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    await render({ open: false });
    await finishExit();
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement === trigger).toBe(true);
  });

  test("窗口使用可见视口、Safe Area 和独立的内容滚动范围", async () => {
    const css = await Bun.file(
      new URL("../../index.css", import.meta.url),
    ).text();
    expect(css).toContain("top: var(--app-viewport-top, 0px);");
    expect(css).toContain("height: var(--app-viewport-height, 100dvh);");
    expect(css).toContain(".native-dialog-viewport:not([open])");
    expect(css).toContain(
      "height: calc(100% - max(12px, env(safe-area-inset-top)));",
    );
    expect(css).toContain("padding-bottom: env(safe-area-inset-bottom);");
    expect(css).toContain("overscroll-behavior: contain;");
    expect(css).toContain("touch-action: none;");
    expect(css).toContain("min-height: 44px;");
    expect(css).toContain(
      ".animated-bg,\n  .animate-spin,\n  .animate-pulse {\n    animation: none;",
    );
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

describe("手机 sheet 手势", () => {
  const gesture = (x: number, y: number, velocity = 0) => ({
    offset: { x, y },
    velocity: { x: 0, y: velocity },
  });
  test("足够的下滑距离或明确的向下快速滑动请求关闭", () => {
    expect(shouldDismissSheet(gesture(0, 150), 800)).toBe(true);
    expect(shouldDismissSheet(gesture(5, 45, 650), 800)).toBe(true);
  });
  test("向上、横向和短距离操作保持窗口", () => {
    expect(shouldDismissSheet(gesture(0, -200), 800)).toBe(false);
    expect(shouldDismissSheet(gesture(200, 150), 800)).toBe(false);
    expect(shouldDismissSheet(gesture(0, 30, 650), 800)).toBe(false);
    expect(shouldDismissSheet(gesture(0, 60, 100), 800)).toBe(false);
  });
  test("较矮窗口继续要求明确的下滑距离", () => {
    expect(shouldDismissSheet(gesture(0, 80), 300)).toBe(true);
    expect(shouldDismissSheet(gesture(0, 60), 300)).toBe(false);
  });
});
