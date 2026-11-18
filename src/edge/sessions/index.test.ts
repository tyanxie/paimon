import { expect, test } from "bun:test";
import { MemorySessionIndex } from "./index";
import type { SessionSummary } from "./types";

function session(id: string, day: number, name?: string): SessionSummary {
  return {
    id,
    path: `/sessions/${id}`,
    cwd: "/project",
    name,
    created: "2026-01-01T00:00:00.000Z",
    modified: `2026-01-0${day}T00:00:00.000Z`,
    messageCount: 1,
    firstMessage: `preview ${id}`,
  };
}

test("目录替换、单文件更新和删除不影响其他目录", async () => {
  const index = new MemorySessionIndex();
  await index.replaceDirectory("/one", [session("a", 1), session("b", 2)]);
  await index.replaceDirectory("/two", [session("c", 3)]);
  await index.replaceDirectory("/one", [session("a", 2)]);
  await index.updateSession("/one", session("a", 3, "updated"));
  await index.updateSession("/one", session("d", 4));
  await index.removeSession("/one", "/sessions/d");
  expect((await index.query("/one")).sessions).toEqual([
    session("a", 3, "updated"),
  ]);
  expect((await index.query("/two")).sessions).toEqual([session("c", 3)]);
  expect(await index.query("/missing")).toEqual({
    sessions: [],
    total: 0,
    hasMore: false,
  });
});

test("按活动时间及路径排序，搜索不区分大小写且分页统计基于过滤结果", async () => {
  const index = new MemorySessionIndex();
  await index.replaceDirectory("/sessions", [
    session("a", 1, "Match"),
    session("b", 3, "match"),
    session("c", 3, "MATCH"),
    session("d", 4),
  ]);
  const page = await index.query("/sessions", {
    filter: "mAtCh",
    offset: 1,
    limit: 1,
  });
  expect(page).toEqual({
    sessions: [session("b", 3, "match")],
    total: 3,
    hasMore: true,
  });
  expect(
    await index.query("/sessions", { filter: "match", offset: 2, limit: 1 }),
  ).toEqual({ sessions: [session("a", 1, "Match")], total: 3, hasMore: false });
  expect(
    (await index.query("/sessions", { filter: "PREVIEW D" })).sessions,
  ).toEqual([session("d", 4)]);
  page.sessions[0].name = "mutated";
  expect(
    (await index.query("/sessions", { filter: "match", offset: 1, limit: 1 }))
      .sessions[0].name,
  ).toBe("match");
});
