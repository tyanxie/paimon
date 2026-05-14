import { describe, expect, test } from "bun:test";

const { getModelPopoverPosition } = await import("./ModelSelector");
const source = await Bun.file(new URL("./ModelSelector.tsx", import.meta.url)).text();

describe("ModelSelector popover", () => {
  test("使用 fixed 坐标锚定到触发按钮上方并保留视口边距", () => {
    expect(
      getModelPopoverPosition({
        anchorRect: { top: 700, right: 920 },
        viewportWidth: 1000,
        viewportHeight: 800,
      }),
    ).toEqual({ right: 80, bottom: 108 });

    expect(
      getModelPopoverPosition({
        anchorRect: { top: 20, right: 995 },
        viewportWidth: 1000,
        viewportHeight: 800,
      }),
    ).toEqual({ right: 12, bottom: 788 });
  });

  test("popover 通过 portal 渲染，避免嵌套在 composer 玻璃层内", () => {
    expect(source).toContain("createPortal(");
    expect(source).toContain("position: \"fixed\"");
  });

  test("popover 玻璃层不承担滚动裁剪", () => {
    const outerClass = source.match(
      /className="([^"]*glass-popover[^"]*)"/,
    )?.[1] ?? "";

    expect(outerClass).not.toContain("overflow-y-auto");
    expect(outerClass).not.toContain("max-h-[320px]");
    expect(source).toContain(
      'className="max-h-[320px] overflow-y-auto py-1.5 scrollbar-auto"',
    );
  });
});
