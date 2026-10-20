import { describe, expect, test } from "bun:test";
import {
  getConversationScrollSpacing,
  pinScrollToBottomIfNeeded,
} from "./utils";
const css = await Bun.file(new URL("../../index.css", import.meta.url)).text();
const instanceViewSource = await Bun.file(
  new URL("./index.tsx", import.meta.url),
).text();
const composerSource = await Bun.file(
  new URL("./Composer.tsx", import.meta.url),
).text();
const sidebarSource = await Bun.file(
  new URL("../Sidebar.tsx", import.meta.url),
).text();
const mobileNavBarSource = await Bun.file(
  new URL("../ui/MobileNavBar.tsx", import.meta.url),
).text();
const instanceHeaderSource = await Bun.file(
  new URL("../ui/InstanceHeader.tsx", import.meta.url),
).text();
const modalShellSource = await Bun.file(
  new URL("../ui/ModalShell.tsx", import.meta.url),
).text();
const toolCallCardSource = await Bun.file(
  new URL("../entries/ToolCallCard.tsx", import.meta.url),
).text();
const modelSelectorSource = await Bun.file(
  new URL("../ui/ModelSelector.tsx", import.meta.url),
).text();

describe("InstanceView 底部 pin 滚动", () => {
  test("已在底部且真实几何偏离时滚到底部", () => {
    let scrollCount = 0;

    const didScroll = pinScrollToBottomIfNeeded({
      isAtBottom: true,
      isLoadingMore: false,
      distanceToBottom: 19,
      overlap: 6,
      scrollToBottom: () => {
        scrollCount += 1;
      },
    });

    expect(didScroll).toBe(true);
    expect(scrollCount).toBe(1);
  });

  test("用户离开底部或加载更多时不抢滚动", () => {
    let scrollCount = 0;

    expect(
      pinScrollToBottomIfNeeded({
        isAtBottom: false,
        isLoadingMore: false,
        distanceToBottom: 19,
        overlap: 6,
        scrollToBottom: () => {
          scrollCount += 1;
        },
      }),
    ).toBe(false);
    expect(
      pinScrollToBottomIfNeeded({
        isAtBottom: true,
        isLoadingMore: true,
        distanceToBottom: 19,
        overlap: 6,
        scrollToBottom: () => {
          scrollCount += 1;
        },
      }),
    ).toBe(false);
    expect(
      pinScrollToBottomIfNeeded({
        isAtBottom: true,
        isLoadingMore: false,
        distanceToBottom: 0,
        overlap: -12,
        scrollToBottom: () => {
          scrollCount += 1;
        },
      }),
    ).toBe(false);
    expect(scrollCount).toBe(0);
  });
});

describe("InstanceView 间距计算", () => {
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
    expect(
      rule.indexOf("-webkit-backdrop-filter: blur(30px);"),
    ).toBeGreaterThan(-1);
    expect(rule.indexOf("backdrop-filter: blur(30px);")).toBeGreaterThan(
      rule.indexOf("-webkit-backdrop-filter: blur(30px);"),
    );
  });
});

describe("导航、顶部与输入区布局", () => {
  test("侧栏共用完整玻璃面板，选中实例使用轻量填充", () => {
    expect(sidebarSource).toContain("sidebar-layout select-none glass-panel");
    expect(sidebarSource).toContain("sidebar-header");
    expect(sidebarSource).toContain("sidebar-navigation");
    expect(sidebarSource).toContain("instance-list");
    expect(css).toContain(
      '.instance-item[aria-current="page"] {\n  background: var(--fill-secondary);',
    );
    expect(css).toContain("background: var(--panel-bg);");
  });

  test("顶部使用右侧区域宽度，正文与输入区保持阅读宽度", () => {
    expect(instanceViewSource).toContain(
      'className="conversation-topbar header-material pointer-events-auto w-full px-3 py-2 md:px-4"',
    );
    expect(instanceViewSource).toContain(
      'className="mx-auto max-w-[920px] space-y-2"',
    );
    expect(instanceViewSource).toContain(
      'className="pointer-events-auto mx-auto w-full max-w-[920px]"',
    );
    expect(instanceHeaderSource).toContain("min-h-[44px]");
    expect(composerSource).toContain("block min-h-12 w-full");
    expect(composerSource).toContain("px-4 pb-2.5 pt-3");
    expect(composerSource).toContain("gap-1.5 px-3 pb-3");
    expect(instanceHeaderSource).not.toContain("header-material");
    expect(instanceHeaderSource).not.toContain("max-w-");
  });

  test("工具栏按输入容器宽度收纳辅助操作", () => {
    expect(css).toContain("container: composer / inline-size;");
    expect(css).toContain("@container composer (min-width: 640px)");
    expect(composerSource).toContain("composer-inline-options");
    expect(composerSource).toContain("composer-more-options");
    expect(composerSource).toContain("composer-surface glass-panel-input");
  });
});

describe("文本选择边界", () => {
  test("纯导航和操作控件禁用误选", () => {
    expect(sidebarSource).toContain("sidebar-layout select-none");
    expect(mobileNavBarSource).toContain("select-none");
    expect(toolCallCardSource).toContain("text-left group select-none");
    expect(instanceViewSource.includes("import { Button }")).toBe(true);
    expect(css.includes("user-select: none;")).toBe(true);
    expect(composerSource).toContain("select-none shrink-0 rounded-full");
  });

  test("有复制价值的信息文本显式保留可选择", () => {
    expect(instanceHeaderSource).toContain(
      "font-medium text-[var(--label-primary)] select-text",
    );
    expect(instanceHeaderSource).not.toContain('select-text">{text}</span>');

    expect(composerSource).toContain("composer-context-detail select-text");
    expect(mobileNavBarSource).toContain("truncate select-text");
    expect(modalShellSource).toContain(
      "text-[var(--label-primary)] select-text",
    );
    expect(modelSelectorSource).toContain("max-w-[140px] truncate select-text");
  });

  test("对话列表使用派生分组并连接折叠阅读位置管理", () => {
    expect(instanceViewSource).toContain("<ConversationList");
    expect(instanceViewSource).toContain("items={displayItems}");
    expect(instanceViewSource).toContain(
      "onBeforeToggle={prepareForContentResize}",
    );
  });

  test("加载和空状态占位文案禁用选择", () => {
    expect(
      instanceViewSource.includes('t("conversation.loadingEarlier")'),
    ).toBe(true);
    expect(
      instanceViewSource.includes('<StatusMessage compact tone="loading"'),
    ).toBe(true);
    expect(instanceViewSource.includes('t("conversation.noMessages")')).toBe(
      true,
    );
    expect(
      instanceViewSource.includes('<StatusMessage className="pt-8">'),
    ).toBe(true);
    expect(instanceViewSource).toContain(
      'className="space-y-3 pt-3 select-none"',
    );
  });
});
