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
const eventStreamSource = await Bun.file(new URL("./EventStream.tsx", import.meta.url)).text();
const sidebarSource = await Bun.file(new URL("./Sidebar.tsx", import.meta.url)).text();
const mobileNavBarSource = await Bun.file(new URL("./ui/MobileNavBar.tsx", import.meta.url)).text();
const modalShellSource = await Bun.file(new URL("./ui/ModalShell.tsx", import.meta.url)).text();
const toolCallCardSource = await Bun.file(new URL("./entries/ToolCallCard.tsx", import.meta.url)).text();
const modelSelectorSource = await Bun.file(new URL("./ui/ModelSelector.tsx", import.meta.url)).text();

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

describe("文本选择边界", () => {
  test("纯导航和操作控件禁用误选", () => {
    expect(sidebarSource).toContain("glass-panel select-none");
    expect(mobileNavBarSource).toContain("select-none");
    expect(toolCallCardSource).toContain("text-left group select-none");
    expect(eventStreamSource).toContain("className=\"select-none w-9 h-9");
    expect(eventStreamSource).toContain("className=\"select-none w-[28px] h-[28px]");
    expect(eventStreamSource).toContain("className={`select-none w-[28px] h-[28px]");
  });

  test("有复制价值的信息文本显式保留可选择", () => {
    expect(eventStreamSource).toContain("font-medium text-[var(--label-primary)] select-text");
    expect(eventStreamSource).toContain("className=\"truncate select-text\">{gitBranch}</span>");
    expect(eventStreamSource).toContain("<span className=\"select-text\">{isRunning ? \"执行中\" : \"在线\"}</span>");
    expect(eventStreamSource).toContain("<span className=\"select-text\" style={{ color }}>");
    expect(mobileNavBarSource).toContain("truncate select-text");
    expect(modalShellSource).toContain("text-[var(--label-primary)] select-text");
    expect(modelSelectorSource).toContain("hidden md:inline select-text");
  });

  test("加载和空状态占位文案禁用选择", () => {
    expect(eventStreamSource).toContain("Loading earlier messages...");
    expect(eventStreamSource).toContain("text-[11px] py-2 select-none");
    expect(eventStreamSource).toContain("No messages yet");
    expect(eventStreamSource).toContain("text-[12px] pt-8 select-none");
    expect(eventStreamSource).toContain("className=\"space-y-3 pt-3 select-none\"");
  });
});
