import { describe, expect, test } from "bun:test";
import type { InstanceId } from "../../../protocol/types";
import type { SessionEntry } from "./useAppState";
import {
  applyHistoryResponse,
  beginInstanceRefresh,
  beginLoadMore,
  createConversationState,
  getInstanceDraft,
  setInstanceDraft,
  applyConversationError,
} from "./useAppState";

function entry(id: string): SessionEntry {
  return {
    id,
    type: "message",
    message: { role: "user", content: id },
  };
}

describe("当前实例对话状态", () => {
  test("切换实例时清空当前对话并进入刷新态，但保留各实例草稿", () => {
    const a = "A" as InstanceId;
    const b = "B" as InstanceId;
    const state = createConversationState();
    state.currentInstanceId = a;
    state.entries = [entry("old")];
    state.streamingEntry = entry("streaming");
    state.hasMore = true;
    state.drafts = setInstanceDraft(state.drafts, a, "draft A");

    const next = beginInstanceRefresh(state, b);

    expect(next.currentInstanceId).toBe(b);
    expect(next.entries).toEqual([]);
    expect(next.streamingEntry).toBeNull();
    expect(next.hasMore).toBe(false);
    expect(next.loadState).toBe("refreshing");
    expect(getInstanceDraft(next.drafts, a)).toBe("draft A");
    expect(getInstanceDraft(next.drafts, b)).toBe("");
  });

  test("刷新态收到当前实例 history 时替换 entries", () => {
    const a = "A" as InstanceId;
    const state = beginInstanceRefresh(createConversationState(), a);
    state.entries = [entry("stale")];

    const next = applyHistoryResponse(state, a, [entry("fresh")], true);

    expect(next.entries.map((item) => item.id)).toEqual(["fresh"]);
    expect(next.hasMore).toBe(true);
    expect(next.loadState).toBe("idle");
    expect(next.shouldScrollToBottom).toBe(true);
  });

  test("加载更多态收到当前实例 history 时 prepend entries", () => {
    const a = "A" as InstanceId;
    const state = beginLoadMore({
      ...beginInstanceRefresh(createConversationState(), a),
      loadState: "idle",
      entries: [entry("newer")],
      hasMore: true,
    });

    const next = applyHistoryResponse(state, a, [entry("older")], false);

    expect(next.entries.map((item) => item.id)).toEqual(["older", "newer"]);
    expect(next.hasMore).toBe(false);
    expect(next.loadState).toBe("idle");
    expect(next.shouldScrollToBottom).toBe(false);
  });

  test("非当前实例的 history 响应会被丢弃", () => {
    const a = "A" as InstanceId;
    const b = "B" as InstanceId;
    const state = beginInstanceRefresh(createConversationState(), a);

    const next = applyHistoryResponse(state, b, [entry("wrong")], true);

    expect(next).toBe(state);
  });

  test("草稿按实例隔离保存", () => {
    const a = "A" as InstanceId;
    const b = "B" as InstanceId;
    let drafts = new Map<InstanceId, string>();

    drafts = setInstanceDraft(drafts, a, "hello A");
    drafts = setInstanceDraft(drafts, b, "hello B");
    drafts = setInstanceDraft(drafts, a, "");

    expect(getInstanceDraft(drafts, a)).toBe("");
    expect(getInstanceDraft(drafts, b)).toBe("hello B");
  });

  test("错误状态保留可展示的错误信息", () => {
    const a = "A" as InstanceId;
    const state = beginInstanceRefresh(createConversationState(), a);

    const next = applyConversationError(state, "Instance not found");

    expect(next.loadState).toBe("error");
    expect(next.errorMessage).toBe("Instance not found");
  });
});
