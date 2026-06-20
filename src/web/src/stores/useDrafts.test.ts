// useDrafts store 测试

import { describe, expect, test, beforeEach } from "bun:test";
import type { InstanceId } from "../../../protocol/types";
import { useDrafts, EMPTY_DRAFT } from "./useDrafts";

describe("草稿 store", () => {
  beforeEach(() => {
    // 每个测试前重置 store 状态
    useDrafts.setState({ drafts: new Map() });
  });

  test("未设置过的实例返回空草稿", () => {
    const { drafts } = useDrafts.getState();
    const draft = drafts.get("unknown" as InstanceId) ?? EMPTY_DRAFT;
    expect(draft).toEqual(EMPTY_DRAFT);
  });

  test("null instanceId 返回空草稿", () => {
    const { drafts } = useDrafts.getState();
    expect(drafts.get(null as unknown as InstanceId) ?? EMPTY_DRAFT).toEqual(
      EMPTY_DRAFT,
    );
  });

  test("草稿按实例隔离保存", () => {
    const a = "A" as InstanceId;
    const b = "B" as InstanceId;
    const { setDraft } = useDrafts.getState();

    setDraft(a, { text: "hello A", images: [] });
    setDraft(b, { text: "hello B", images: [] });

    const { drafts } = useDrafts.getState();
    expect(drafts.get(a) ?? EMPTY_DRAFT).toEqual({
      text: "hello A",
      images: [],
    });
    expect(drafts.get(b) ?? EMPTY_DRAFT).toEqual({
      text: "hello B",
      images: [],
    });
  });

  test("设置空草稿时从 Map 中删除", () => {
    const a = "A" as InstanceId;
    const { setDraft } = useDrafts.getState();

    setDraft(a, { text: "hello", images: [] });
    expect((useDrafts.getState().drafts.get(a) ?? EMPTY_DRAFT).text).toBe(
      "hello",
    );

    setDraft(a, { text: "", images: [] });
    expect(useDrafts.getState().drafts.get(a) ?? EMPTY_DRAFT).toEqual(
      EMPTY_DRAFT,
    );
    expect(useDrafts.getState().drafts.has(a)).toBe(false);
  });

  test("updater 函数模式基于当前值更新", () => {
    const a = "A" as InstanceId;
    const { setDraft } = useDrafts.getState();

    setDraft(a, { text: "initial", images: [] });
    setDraft(a, (prev) => ({ ...prev, text: prev.text + " updated" }));

    const draft = useDrafts.getState().drafts.get(a) ?? EMPTY_DRAFT;
    expect(draft.text).toBe("initial updated");
  });
});
