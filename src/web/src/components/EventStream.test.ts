import { describe, expect, test } from "bun:test";

Object.assign(globalThis, {
  localStorage: {
    getItem: () => null,
    setItem: () => undefined,
  },
  document: {
    documentElement: {
      setAttribute: () => undefined,
    },
  },
  window: {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  },
});

const { getConversationScrollSpacing } = await import("./EventStream");
const css = await Bun.file(new URL("../index.css", import.meta.url)).text();

describe("EventStream 间距计算", () => {
  test("滚动到底部按钮底边与对话内容底部留白对齐", () => {
    expect(
      getConversationScrollSpacing({
        topChromeHeight: 64,
        bottomChromeHeight: 96,
        bottomSafeGap: 0,
      }),
    ).toEqual({
      paddingTop: 60,
      paddingBottom: 108,
      scrollButtonBottom: 108,
    });

    expect(
      getConversationScrollSpacing({
        topChromeHeight: 64,
        bottomChromeHeight: 180,
        bottomSafeGap: 0,
      }),
    ).toEqual({
      paddingTop: 60,
      paddingBottom: 192,
      scrollButtonBottom: 192,
    });

    expect(
      getConversationScrollSpacing({
        topChromeHeight: 64,
        bottomChromeHeight: 132,
        bottomSafeGap: 34,
      }),
    ).toEqual({
      paddingTop: 60,
      paddingBottom: 110,
      scrollButtonBottom: 144,
    });
  });
});

describe("玻璃样式", () => {
  test("popover 对齐 panel 材质并保留 backdrop-filter 兼容声明顺序", () => {
    const rule = css.match(/\.glass-popover\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(css).not.toContain("--material-popover:");
    expect(rule).toContain("background: var(--panel-bg);");
    expect(rule.indexOf("-webkit-backdrop-filter: blur(30px);")).toBeGreaterThan(-1);
    expect(rule.indexOf("backdrop-filter: blur(30px);")).toBeGreaterThan(
      rule.indexOf("-webkit-backdrop-filter: blur(30px);"),
    );
  });
});
