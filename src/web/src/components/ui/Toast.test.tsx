import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { ToastContainer, showToast } from "./Toast";

let root: Root;
let container: HTMLDivElement;
let showDescriptor: PropertyDescriptor | undefined;
let hideDescriptor: PropertyDescriptor | undefined;
let shows: number;
let hides: number;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  shows = 0;
  hides = 0;
  showDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "showPopover",
  );
  hideDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "hidePopover",
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  if (showDescriptor)
    Object.defineProperty(HTMLElement.prototype, "showPopover", showDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "showPopover");
  if (hideDescriptor)
    Object.defineProperty(HTMLElement.prototype, "hidePopover", hideDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "hidePopover");
});
async function render() {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <ToastContainer />
      </MotionConfig>,
    ),
  );
}
describe("Toast 功能", () => {
  test("保留等级、完整文字与 Portal 展示", async () => {
    await render();
    await act(async () => {
      showToast("warning message", "warning");
      showToast("error message", "error");
    });
    expect(document.querySelector('[role="status"]')!.textContent).toBe(
      "warning message",
    );
    expect(document.querySelector('[role="alert"]')!.textContent).toBe(
      "error message",
    );
    expect(container.querySelector(".toast-container") === null).toBe(true);
    expect(
      document.querySelector(".toast-container")!.hasAttribute("popover"),
    ).toBe(false);
  });
  test("支持 Popover API 时请求独立显示层并在卸载时关闭", async () => {
    Object.defineProperty(HTMLElement.prototype, "showPopover", {
      configurable: true,
      value: () => shows++,
    });
    Object.defineProperty(HTMLElement.prototype, "hidePopover", {
      configurable: true,
      value: () => hides++,
    });
    await render();
    await act(async () => showToast("notice"));
    expect(shows).toBe(1);
    expect(
      document.querySelector(".toast-container")!.getAttribute("popover"),
    ).toBe("manual");
    await act(async () => root.render(null));
    expect(hides > 0).toBe(true);
  });
  test("卸载清理尚未完成的提示计时器", async () => {
    const timers = spyOn(globalThis, "setTimeout");
    const clear = spyOn(globalThis, "clearTimeout");
    try {
      await render();
      await act(async () => showToast("error", "error"));
      const index = timers.mock.calls.findIndex(([, delay]) => delay === 5000);
      expect(index >= 0).toBe(true);
      const timer = timers.mock.results[index]!.value;
      await act(async () => root.render(null));
      expect(clear.mock.calls.some(([value]) => value === timer)).toBe(true);
    } finally {
      timers.mockRestore();
      clear.mockRestore();
    }
  });
});
