import { afterEach, beforeEach, describe, expect, test } from "bun:test";

let viewport: { width: number; height: number };
beforeEach(() => {
  viewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(() => {
  window.innerWidth = viewport.width;
  window.innerHeight = viewport.height;
});

const { calcPosition } = await import("./Popover");
const popoverSource = await Bun.file(
  new URL("./Popover.tsx", import.meta.url),
).text();
const selectorSource = await Bun.file(
  new URL("./ModelSelector.tsx", import.meta.url),
).text();

describe("Popover 位置计算", () => {
  test("默认右对齐、向上弹出，锚定到触发按钮上方并保留视口边距", () => {
    // 模拟 window.innerWidth=1000, innerHeight=800
    Object.defineProperty(window, "innerWidth", {
      value: 1000,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      writable: true,
    });

    expect(
      calcPosition({ top: 700, bottom: 720, left: 800, right: 920 }),
    ).toEqual({
      right: 80,
      bottom: 108,
    });

    expect(
      calcPosition({ top: 20, bottom: 40, left: 900, right: 995 }),
    ).toEqual({
      right: 12,
      bottom: 788,
    });
  });

  test("align=left 时左对齐锚点", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 1000,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      writable: true,
    });

    // 向上弹出、左对齐
    expect(
      calcPosition(
        { top: 700, bottom: 720, left: 50, right: 200 },
        "top",
        "left",
      ),
    ).toEqual({
      left: 50,
      bottom: 108,
    });

    // 左边紧贴视口边缘时 clamp 到 viewportPadding
    expect(
      calcPosition(
        { top: 700, bottom: 720, left: 5, right: 150 },
        "top",
        "left",
      ),
    ).toEqual({
      left: 12,
      bottom: 108,
    });
  });

  test("窄屏中左侧弹层根据实际宽度保持在视口内", () => {
    window.innerWidth = 320;
    window.innerHeight = 600;
    expect(
      calcPosition(
        { top: 500, bottom: 520, left: 240, right: 280 },
        "top",
        "left",
        8,
        12,
        280,
      ),
    ).toEqual({ left: 28, bottom: 108 });
    expect(
      calcPosition(
        { top: 500, bottom: 520, left: 240, right: 280 },
        "top",
        "left",
        8,
        12,
        600,
      ),
    ).toEqual({ left: 12, bottom: 108 });
  });

  test("placement=bottom 时向下弹出", () => {
    Object.defineProperty(window, "innerWidth", {
      value: 1000,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 800,
      writable: true,
    });

    expect(
      calcPosition(
        { top: 100, bottom: 120, left: 50, right: 200 },
        "bottom",
        "left",
      ),
    ).toEqual({
      left: 50,
      top: 128,
    });

    expect(
      calcPosition(
        { top: 100, bottom: 120, left: 800, right: 920 },
        "bottom",
        "right",
      ),
    ).toEqual({
      right: 80,
      top: 128,
    });
  });
});

describe("Popover 架构", () => {
  test("通过 portal 渲染，避免嵌套在 composer 玻璃层内", () => {
    expect(popoverSource).toContain("createPortal(");
    expect(popoverSource).toContain('position: "fixed"');
  });
});

describe("ModelSelector", () => {
  test("使用 Popover 组件", () => {
    expect(selectorSource).toContain('import { Popover } from "./Popover"');
    expect(selectorSource).toContain("<Popover");
  });

  test("滚动裁剪在内容层而非 popover 壳", () => {
    expect(selectorSource).toContain(
      'className="ui-menu-scroll scrollbar-auto"',
    );
  });
});
