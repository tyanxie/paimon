import { describe, expect, test } from "bun:test";

// 确保 window 对象存在（单独运行此文件时 Bun 不提供浏览器全局）
if (typeof window === "undefined") {
  Object.assign(globalThis, { window: globalThis });
}

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

  test("popover 玻璃层不承担滚动裁剪", () => {
    const outerClass =
      popoverSource.match(/className="([^"]*glass-popover[^"]*)"/)?.[1] ?? "";

    expect(outerClass).not.toContain("overflow-y-auto");
    expect(outerClass).not.toContain("max-h-");
  });
});

describe("ModelSelector", () => {
  test("使用 Popover 组件", () => {
    expect(selectorSource).toContain('import { Popover } from "./Popover"');
    expect(selectorSource).toContain("<Popover");
  });

  test("滚动裁剪在内容层而非 popover 壳", () => {
    expect(selectorSource).toContain(
      'className="max-h-[320px] overflow-y-auto py-1.5 px-1.5 scrollbar-auto"',
    );
  });
});
