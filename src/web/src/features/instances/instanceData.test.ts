import { describe, expect, test } from "bun:test";
import {
  isBrowseEntry,
  isBrowseResult,
  isInstanceCreationEdgesResponse,
} from "./instanceData";

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

  test("目录浏览结果保留原始对象和扩展字段", () => {
    const entries = [{ name: "folder", extra: true }];
    const response: unknown = {
      parent: "/home/",
      entries,
      truncated: false,
      extra: true,
    };
    expect(isBrowseResult(response)).toBe(true);
    if (!isBrowseResult(response)) throw new Error("Expected browse result");
    expect(response.entries).toBe(entries);
    expect(isBrowseResult({ parent: "/", entries: [], truncated: true })).toBe(
      true,
    );
  });

  test("目录浏览结果拒绝不满足导航协议的响应", () => {
    const valid = { parent: "/home/", entries: [], truncated: false };
    for (const value of [
      null,
      [],
      {},
      { ...valid, parent: "/home" },
      { ...valid, parent: "home/" },
      { ...valid, parent: 1 },
      { ...valid, entries: null },
      { ...valid, entries: [{ name: 1 }] },
      { ...valid, truncated: "false" },
    ]) {
      expect(isBrowseResult(value)).toBe(false);
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
