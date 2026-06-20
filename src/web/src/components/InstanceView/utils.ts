// InstanceView 纯计算工具函数

import type { InstanceStatus } from "../../../../protocol/types";
import { isStreaming as isStatusStreaming } from "../../utils/status";

const BOTTOM_FOLLOW_EPSILON = 0.5;

export function getConversationScrollSpacing({
  topChromeHeight,
  bottomChromeHeight,
  bottomSafeGap = 0,
}: {
  topChromeHeight: number;
  bottomChromeHeight: number;
  bottomSafeGap?: number;
}) {
  const bottomChromeAboveViewport = Math.max(
    0,
    bottomChromeHeight - bottomSafeGap,
  );
  const paddingBottom = Math.max(40, bottomChromeAboveViewport + 12);

  return {
    paddingTop: Math.max(24, topChromeHeight - 4),
    paddingBottom,
    scrollButtonBottom: bottomSafeGap + paddingBottom,
  };
}

export function calculatePrependScrollTop({
  previousScrollTop,
  previousScrollHeight,
  nextScrollHeight,
}: {
  previousScrollTop: number;
  previousScrollHeight: number;
  nextScrollHeight: number;
}) {
  return previousScrollTop + nextScrollHeight - previousScrollHeight;
}

export function getComposerButtonMode(instanceStatus?: InstanceStatus) {
  return isStatusStreaming(instanceStatus) ? "stop" : "send";
}

export function getSafeScrollTop(rawScrollTop: number) {
  return Math.max(0, rawScrollTop);
}

export function pinScrollToBottomIfNeeded({
  isAtBottom,
  isLoadingMore,
  distanceToBottom,
  overlap,
  force = false,
  scrollToBottom,
}: {
  isAtBottom: boolean;
  isLoadingMore: boolean;
  distanceToBottom: number;
  overlap: number;
  force?: boolean;
  scrollToBottom: () => void;
}) {
  if (!isAtBottom || isLoadingMore) return false;
  if (!force && distanceToBottom <= BOTTOM_FOLLOW_EPSILON && overlap <= 0) {
    return false;
  }

  scrollToBottom();
  return true;
}

export function shouldLoadMoreFromScroll({
  rawScrollTop,
  hasMore,
  canLoadMore,
  isLoadingMore,
  isSuppressed,
}: {
  rawScrollTop: number;
  hasMore: boolean;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  isSuppressed: boolean;
}) {
  return (
    rawScrollTop >= 0 &&
    getSafeScrollTop(rawScrollTop) < 100 &&
    hasMore &&
    canLoadMore &&
    !isLoadingMore &&
    !isSuppressed
  );
}
