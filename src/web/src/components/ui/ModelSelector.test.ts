import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { calcPosition } from "./Popover";

let viewport: { width: number; height: number };
beforeEach(() => {
  viewport = { width: window.innerWidth, height: window.innerHeight };
  window.innerWidth = 1000;
  window.innerHeight = 800;
});
afterEach(() => {
  window.innerWidth = viewport.width;
  window.innerHeight = viewport.height;
});

describe("Popover 位置计算", () => {
  test("上下弹出与左右定位使用调用方提供的间距", () => {
    const anchor = { top: 100, bottom: 120, left: 50, right: 200 };
    const margin = 17;
    const padding = 11;
    expect(calcPosition(anchor, "top", "right", margin, padding)).toEqual({
      right: window.innerWidth - anchor.right,
      bottom: window.innerHeight - anchor.top + margin,
    });
    expect(calcPosition(anchor, "bottom", "left", margin, padding)).toEqual({
      left: anchor.left,
      top: anchor.bottom + margin,
    });
  });

  test("锚点与较宽面板限制在可用视口范围内", () => {
    window.innerWidth = 320;
    const padding = 11;
    const anchor = { top: 500, bottom: 520, left: 240, right: 319 };
    for (const width of [280, 600]) {
      const position = calcPosition(anchor, "top", "left", 17, padding, width);
      const visibleWidth = Math.min(width, window.innerWidth - padding * 2);
      expect(position.left!).toBeGreaterThanOrEqual(padding);
      expect(position.left! + visibleWidth).toBeLessThanOrEqual(
        window.innerWidth - padding,
      );
    }
    expect(calcPosition(anchor, "top", "right", 17, padding).right).toBe(
      padding,
    );
    expect(
      calcPosition({ ...anchor, left: 0 }, "bottom", "left", 17, padding).left,
    ).toBe(padding);
  });
});
