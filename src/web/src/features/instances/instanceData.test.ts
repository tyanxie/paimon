import { describe, expect, test } from "bun:test";
import { isBrowseEntry, isInstanceCreationEdgesResponse } from "./instanceData";

describe("实例创建数据识别", () => {
  test("Edge 列表保留原始对象、顺序与扩展字段", () => {
    const edges = [
      { edgeId: "one", hostname: "first", homedir: "/home", extra: true },
    ];
    const response: unknown = { edges };
    expect(isInstanceCreationEdgesResponse(response)).toBe(true);
    if (!isInstanceCreationEdgesResponse(response))
      throw new Error("Expected Edge list");
    expect(response.edges).toBe(edges);
    expect(isInstanceCreationEdgesResponse({ edges: [] })).toBe(true);
  });

  test("Edge 列表拒绝无效响应和字段类型", () => {
    for (const value of [
      null,
      [],
      {},
      { edges: null },
      { edges: [null] },
      { edges: [{ edgeId: 1, hostname: "host", homedir: "/home" }] },
    ]) {
      expect(isInstanceCreationEdgesResponse(value)).toBe(false);
    }
  });

  test("目录条目接受原始名称，拒绝无效字段", () => {
    expect(isBrowseEntry({ name: "folder", extra: true })).toBe(true);
    expect(isBrowseEntry({ name: "" })).toBe(true);
    for (const value of [null, [], "folder", {}, { name: 1 }]) {
      expect(isBrowseEntry(value)).toBe(false);
    }
  });
});
