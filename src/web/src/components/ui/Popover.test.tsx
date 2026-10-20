import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { Popover } from "./Popover";
import { Button } from "./Button";
import { TextField } from "./FormControls";

let root: Root;
let container: HTMLDivElement;
let viewport: EventTarget & {
  height: number;
  width: number;
  offsetTop: number;
  offsetLeft: number;
};
let original: PropertyDescriptor | undefined;
beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(window, "visualViewport");
  viewport = Object.assign(new EventTarget(), {
    width: 393,
    height: 500,
    offsetTop: 0,
    offsetLeft: 0,
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  if (original) Object.defineProperty(window, "visualViewport", original);
  else Reflect.deleteProperty(window, "visualViewport");
});
async function render(disabled = false) {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <Popover
          label="options"
          width={320}
          placement="bottom"
          disabled={disabled}
          trigger={({ open, id }) => (
            <Button aria-expanded={open} aria-controls={open ? id : undefined}>
              open
            </Button>
          )}
        >
          {(close) => (
            <div>
              <TextField aria-label="search" />
              <Button onClick={close}>select</Button>
            </div>
          )}
        </Popover>
      </MotionConfig>,
    ),
  );
  const anchor = container.querySelector("button")!.parentElement!;
  anchor.getBoundingClientRect = () => ({
    top: 100,
    bottom: 144,
    left: 330,
    right: 374,
    width: 44,
    height: 44,
    x: 330,
    y: 100,
    toJSON() {},
  });
}
function panel() {
  return document.querySelector<HTMLElement>(
    '[role="dialog"][aria-label="options"]:not([inert])',
  );
}
async function open() {
  await act(async () => container.querySelector("button")!.click());
}
describe("浮层功能", () => {
  test("通过 Portal 展示命名浮层并聚焦搜索字段", async () => {
    await render();
    await open();
    expect(panel() !== null).toBe(true);
    expect(panel()!.parentElement === document.body).toBe(true);
    expect(document.activeElement === panel()!.querySelector("input")).toBe(
      true,
    );
    expect(
      container.querySelector("button")!.getAttribute("aria-controls"),
    ).toBe(panel()!.id);
  });
  test("选择与 Esc 关闭可操作浮层并恢复入口焦点", async () => {
    await render();
    await open();
    await act(async () => panel()!.querySelector("button")!.click());
    expect(panel() === null).toBe(true);
    expect(document.activeElement === container.querySelector("button")).toBe(
      true,
    );
    await open();
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(panel() === null).toBe(true);
    expect(document.activeElement === container.querySelector("button")).toBe(
      true,
    );
  });
  test("位置和滚动范围跟随可见视口", async () => {
    await render();
    await open();
    expect(panel()!.style.left).toBe("54px");
    expect(panel()!.style.maxHeight).toBe("336px");
    viewport.height = 220;
    viewport.offsetTop = 40;
    await act(async () => viewport.dispatchEvent(new Event("resize")));
    expect(panel()!.style.maxHeight).toBe("196px");
    expect(panel()!.style.top).toBe("52px");
    viewport.width = 250;
    await act(async () => viewport.dispatchEvent(new Event("scroll")));
    expect(panel()!.style.width).toBe("226px");
  });
  test("禁用状态关闭浮层且保留入口状态", async () => {
    await render();
    await open();
    await render(true);
    expect(panel() === null).toBe(true);
    expect(
      container.querySelector("button")!.getAttribute("aria-expanded"),
    ).toBe("false");
  });
});
