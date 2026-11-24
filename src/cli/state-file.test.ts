import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { writeJsonState } from "./state-file";

const root = resolve(import.meta.dir, "../../.test-artifacts/state-file");
let directory: string;

beforeEach(async () => {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, "write-"));
});

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
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

const state = {
  pid: 123,
  accessToken: "test-token",
  extension: { retained: true },
};

test("创建父目录并以原有 JSON 格式保存完整状态", async () => {
  const target = join(directory, "nested", "hub.json");
  await writeJsonState(target, state);
  expect(await readFile(target, "utf8")).toBe(JSON.stringify(state, null, 2));
  expect(await Bun.file(target + ".tmp").exists()).toBe(false);
});

test("未指定权限时沿用系统默认创建权限", async () => {
  const reference = join(directory, "reference");
  await writeFile(reference, "reference");
  const target = join(directory, "hub.json");
  await writeJsonState(target, state);
  expect((await stat(target)).mode & 0o777).toBe(
    (await stat(reference)).mode & 0o777,
  );
});

test("未指定权限时不额外修改已有临时文件权限", async () => {
  const target = join(directory, "hub.json");
  await writeFile(target + ".tmp", "stale");
  await chmod(target + ".tmp", 0o640);
  await writeJsonState(target, state);
  expect((await stat(target)).mode & 0o777).toBe(0o640);
});

test("指定 0600 时新建状态文件仅允许当前用户读写", async () => {
  const target = join(directory, "edge.json");
  await writeJsonState(target, state, 0o600);
  expect((await stat(target)).mode & 0o777).toBe(0o600);
  expect(await Bun.file(target).json()).toEqual(state);
});

test("替换状态并收紧宽权限临时文件，不保留临时文件", async () => {
  const target = join(directory, "edge.json");
  await writeFile(target, JSON.stringify({ pid: 1 }));
  await writeFile(target + ".tmp", "stale");
  await chmod(target + ".tmp", 0o644);
  await writeJsonState(target, state, 0o600);
  expect((await stat(target)).mode & 0o777).toBe(0o600);
  expect(await Bun.file(target).json()).toEqual(state);
  expect(await Bun.file(target + ".tmp").exists()).toBe(false);
});

test("序列化失败时保持原状态文件内容", async () => {
  const target = join(directory, "hub.json");
  await writeFile(target, "original");
  await expect(writeJsonState(target, { unsupported: 1n })).rejects.toThrow();
  expect(await readFile(target, "utf8")).toBe("original");
  expect(await Bun.file(target + ".tmp").exists()).toBe(false);
});
