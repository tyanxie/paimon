import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, rmdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { scanSessionDirectory, scanSessionFile } from "./scanner";

const root = resolve(import.meta.dir, "../../../.test-artifacts/sessions");
let directory: string;
const created = "2026-01-01T00:00:00.000Z";
const header = {
  type: "session",
  id: "session-1",
  timestamp: created,
  cwd: "/project",
};

beforeEach(async () => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "scanner-"));
});

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  // 只移除空的公共目录，不清理其他测试的产物
  for (const path of [root, resolve(root, "..")]) {
    try {
      await rmdir(path);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        (error.code !== "ENOENT" && error.code !== "ENOTEMPTY")
      )
        throw error;
    }
  }
});

async function writeSession(entries: unknown[], tail = ""): Promise<string> {
  const path = join(directory, "session.jsonl");
  await writeFile(
    path,
    entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n" + tail,
  );
  return path;
}

test("摘要保留最新名称、全部消息数量、首条文本和用户助手活动时间", async () => {
  const path = await writeSession(
    [
      header,
      { type: "session_info", name: "old" },
      {
        type: "message",
        message: { role: "user", content: [{ type: "image" }] },
      },
      {
        type: "message",
        timestamp: "2026-01-02T00:00:00.000Z",
        message: {
          role: "user",
          content: [
            { type: "text", text: "a".repeat(80) },
            { type: "image" },
            { type: "text", text: "b".repeat(80) },
          ],
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          content: "reply",
          timestamp: Date.parse("2026-01-03T00:00:00Z"),
        },
      },
      {
        type: "message",
        timestamp: "2026-02-01T00:00:00Z",
        message: { role: "toolResult", content: "result" },
      },
      {
        type: "message",
        message: {
          role: "user",
          content: "later",
          timestamp: Date.parse("2026-01-02T12:00:00Z"),
        },
      },
      { type: "session_info", name: "  latest  " },
    ],
    '{broken}\n{"type":',
  );
  expect(await scanSessionFile(path)).toEqual({
    path,
    id: "session-1",
    cwd: "/project",
    created,
    modified: "2026-01-03T00:00:00.000Z",
    name: "latest",
    messageCount: 5,
    firstMessage: ("a".repeat(80) + " " + "b".repeat(80)).slice(0, 100),
  });
});

test("清空名称且无消息时使用创建时间和默认预览", async () => {
  const path = await writeSession([
    header,
    { type: "session_info", name: "named" },
    { type: "session_info", name: " " },
  ]);
  expect(await scanSessionFile(path)).toMatchObject({
    name: undefined,
    modified: created,
    messageCount: 0,
    firstMessage: "(no messages)",
  });
});

test("不存在和无效 header 不产生摘要", async () => {
  expect(await scanSessionFile(join(directory, "missing.jsonl"))).toBeNull();
  const path = await writeSession([
    { type: "session", id: "bad", timestamp: "invalid" },
  ]);
  expect(await scanSessionFile(path)).toBeNull();
  expect(
    await scanSessionDirectory(join(directory, "missing"), () => {}),
  ).toEqual({ sessions: [], failedPaths: [] });
});

test("文件 I/O 错误被报告，正常文件仍扫描，非 JSONL 文件不参与", async () => {
  const path = await writeSession([header]);
  const failed = join(directory, "unreadable.jsonl");
  // 目录作为文件读取会失败，无需依赖运行用户的权限
  await mkdir(failed);
  await writeFile(join(directory, "ignored.txt"), "not a session");
  const errors: string[] = [];
  const result = await scanSessionDirectory(directory, (path) =>
    errors.push(path),
  );
  expect(result.sessions.map((session) => session.path)).toEqual([path]);
  expect(result.failedPaths).toEqual([failed]);
  expect(errors).toEqual([failed]);
  await expect(scanSessionDirectory(path, () => {})).rejects.toThrow();
});
