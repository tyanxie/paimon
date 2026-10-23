import { describe, expect, test } from "bun:test";
import {
  getConversationScrollSpacing,
  pinScrollToBottomIfNeeded,
} from "./utils";

describe("对话悬浮区域间距", () => {
  test("正文起点保留顶部渐隐之外的阅读空间", () => {
    const spacing = getConversationScrollSpacing({
      topChromeHeight: 60,
      bottomChromeHeight: 160,
      bottomSafeGap: 12,
    });
    expect(spacing.paddingTop).toBe(76);
    expect(spacing.paddingBottom).toBe(160);
    expect(spacing.scrollButtonBottom).toBe(172);
  });
});

describe("InstanceView 底部跟随", () => {
  test("位于底部且内容位置变化时继续跟随", () => {
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

  test("浏览历史、加载更多或已到达底部时保持阅读位置", () => {
    let scrollCount = 0;
    const scrollToBottom = () => {
      scrollCount += 1;
    };
    expect(
      pinScrollToBottomIfNeeded({
        isAtBottom: false,
        isLoadingMore: false,
        distanceToBottom: 19,
        overlap: 6,
        scrollToBottom,
      }),
    ).toBe(false);
    expect(
      pinScrollToBottomIfNeeded({
        isAtBottom: true,
        isLoadingMore: true,
        distanceToBottom: 19,
        overlap: 6,
        scrollToBottom,
      }),
    ).toBe(false);
    expect(
      pinScrollToBottomIfNeeded({
        isAtBottom: true,
        isLoadingMore: false,
        distanceToBottom: 0,
        overlap: -12,
        scrollToBottom,
      }),
    ).toBe(false);
    expect(scrollCount).toBe(0);
  });
});
