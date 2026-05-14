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

describe("EventStream 间距计算", () => {
  test("对话内容底部安全高度基于底部浮层可见高度，并扣除 safe area", () => {
    expect(
      getConversationScrollSpacing({
        topChromeHeight: 64,
        bottomChromeHeight: 96,
        bottomSafeGap: 0,
      }),
    ).toEqual({
      paddingTop: 60,
      paddingBottom: 108,
      scrollButtonBottom: 112,
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
      scrollButtonBottom: 196,
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
      scrollButtonBottom: 114,
    });
  });
});
