import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useViewportHeight } from "./useViewportHeight";

let root: Root;
let container: HTMLDivElement;
let original: PropertyDescriptor | undefined;
let viewport: EventTarget & { height: number; offsetTop: number };

function Probe() {
  useViewportHeight();
  return null;
}

beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(window, "visualViewport");
  viewport = Object.assign(new EventTarget(), {
    height: window.innerHeight,
    offsetTop: 0,
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

describe("可见视口", () => {
  test("挂载时读取已显示键盘的高度与顶部位置", async () => {
    viewport.height = window.innerHeight - 300;
    viewport.offsetTop = 24;
    await act(async () => root.render(<Probe />));
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-height"),
    ).toBe(`${viewport.height}px`);
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-top"),
    ).toBe("24px");
  });

  test("视口尺寸与位置变化同步更新，键盘关闭后恢复 CSS 高度", async () => {
    await act(async () => root.render(<Probe />));
    viewport.height = window.innerHeight - 300;
    viewport.offsetTop = 40;
    viewport.dispatchEvent(new Event("resize"));
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-height"),
    ).toBe(`${viewport.height}px`);
    viewport.offsetTop = 80;
    viewport.dispatchEvent(new Event("scroll"));
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-top"),
    ).toBe("80px");
    viewport.height = window.innerHeight;
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event("resize"));
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-height"),
    ).toBe("");
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-top"),
    ).toBe("");
  });

  test("卸载后移除视口覆盖值与事件处理", async () => {
    viewport.height = window.innerHeight - 300;
    viewport.offsetTop = 24;
    await act(async () => root.render(<Probe />));
    await act(async () => root.render(null));
    viewport.dispatchEvent(new Event("resize"));
    viewport.dispatchEvent(new Event("scroll"));
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-height"),
    ).toBe("");
    expect(
      document.documentElement.style.getPropertyValue("--app-viewport-top"),
    ).toBe("");
  });
});
