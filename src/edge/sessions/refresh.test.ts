import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import * as scanner from "./scanner";
import { MemorySessionIndex } from "./index";
import { SessionRefresh } from "./refresh";
import type { SessionSummary } from "./types";

const directory = "/virtual/sessions";
function summary(id: string): SessionSummary {
  return {
    id,
    path: `${directory}/${id}.jsonl`,
    cwd: "/project",
    created: "2026-01-01T00:00:00Z",
    modified: "2026-01-01T00:00:00Z",
    messageCount: 0,
    firstMessage: id,
  };
}
const a = summary("a"),
  b = summary("b");
let full: ReturnType<typeof spyOn<typeof scanner, "scanSessionDirectory">>;
let file: ReturnType<typeof spyOn<typeof scanner, "scanSessionFile">>;
let interval: ReturnType<typeof spyOn<typeof globalThis, "setInterval">>;
let tick: () => void;
let index: MemorySessionIndex;
let refresh: SessionRefresh;
let snapshots: SessionSummary[][];
let errors: string[];

async function drain(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

beforeEach(() => {
  full = spyOn(scanner, "scanSessionDirectory").mockResolvedValue({
    sessions: [a, b],
    failedPaths: [],
  });
  file = spyOn(scanner, "scanSessionFile").mockResolvedValue(a);
  const setIntervalStub = (handler: TimerHandler) => {
    tick = () => {
      if (typeof handler === "function") handler();
    };
    return 1;
  };
  interval = spyOn(globalThis, "setInterval").mockImplementation(
    setIntervalStub as unknown as typeof setInterval,
  );
  index = new MemorySessionIndex();
  snapshots = [];
  errors = [];
  refresh = new SessionRefresh(
    index,
    (path) => errors.push(path),
    (_directory, sessions) => snapshots.push(sessions),
  );
  refresh.start();
});

afterEach(() => {
  full.mockRestore();
  file.mockRestore();
  interval.mockRestore();
});

test("首次注册和切换扫描，重复注册不扫描；当前文件刷新按路径去重并随注销停止", async () => {
  refresh.register("one", a.path);
  await drain();
  expect(full).toHaveBeenCalledTimes(1);
  refresh.register("one", a.path);
  await drain();
  expect(full).toHaveBeenCalledTimes(1);
  refresh.register("one", b.path);
  refresh.register("two", b.path);
  await drain();
  expect(full).toHaveBeenCalledTimes(2);
  tick();
  await drain();
  expect(file).toHaveBeenCalledTimes(1);
  expect(file).toHaveBeenCalledWith(b.path);
  refresh.unregister("one");
  refresh.register("two", undefined);
  tick();
  await drain();
  expect(file).toHaveBeenCalledTimes(1);
});

test("同目录扫描串行，期间的重复注册不排队，文件变化合并为下一轮", async () => {
  let resolveScan!: (value: {
    sessions: SessionSummary[];
    failedPaths: string[];
  }) => void;
  full.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveScan = resolve;
      }),
  );
  refresh.register("one", a.path);
  await drain();
  refresh.register("one", a.path);
  tick();
  await drain();
  expect(full).toHaveBeenCalledTimes(1);
  refresh.register("one", b.path);
  refresh.register("two", a.path);
  await drain();
  expect(full).toHaveBeenCalledTimes(1);
  resolveScan({ sessions: [a], failedPaths: [] });
  await drain();
  expect(full).toHaveBeenCalledTimes(2);
  expect(snapshots).toHaveLength(2);
  expect(snapshots[1]).toHaveLength(2);
});

test("目录刷新保留失败文件旧摘要，更新正常文件并移除已消失文件", async () => {
  await index.replaceDirectory(directory, [a, b, summary("removed")]);
  const updated = { ...b, name: "updated" };
  full.mockResolvedValue({ sessions: [updated], failedPaths: [a.path] });
  refresh.register("one", b.path);
  await drain();
  expect(snapshots[0]).toEqual(expect.arrayContaining([a, updated]));
  expect(snapshots[0]).toHaveLength(2);
  full.mockRejectedValue(new Error("directory unavailable"));
  refresh.register("one", a.path);
  await drain();
  expect(errors).toEqual([directory]);
  expect(snapshots).toHaveLength(1);
  expect((await index.query(directory)).sessions).toEqual(
    expect.arrayContaining([a, updated]),
  );
});

test("当前文件失败仍处理其他文件并发布快照，文件不存在时删除摘要", async () => {
  refresh.register("one", a.path);
  refresh.register("two", b.path);
  await drain();
  file.mockImplementation(async (path) => {
    if (path === a.path) throw new Error("read failed");
    return { ...b, name: "updated" };
  });
  tick();
  await drain();
  expect(errors).toEqual([a.path]);
  expect(snapshots.at(-1)).toEqual(
    expect.arrayContaining([a, { ...b, name: "updated" }]),
  );
  file.mockResolvedValue(null);
  tick();
  await drain();
  expect(snapshots.at(-1)).toEqual([]);
});
