import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { MemorySessionIndex } from "./index";
import { SessionList } from "./list";
import type { SessionSummary } from "./types";
import type {
  SessionWorkerRequest,
  SessionWorkerResponse,
} from "./worker-messages";

class FakeWorker {
  static created: FakeWorker[] = [];
  static failStart = false;
  onmessage?: (event: { data: SessionWorkerResponse }) => void;
  onerror?: (event: { message: string }) => void;
  close?: () => void;
  postMessage = mock((_message: SessionWorkerRequest) => {});
  terminate = mock(() => {});
  constructor(_url: string) {
    if (FakeWorker.failStart) throw new Error("start failed");
    FakeWorker.created.push(this);
  }
  addEventListener(event: string, callback: () => void): void {
    if (event === "close") this.close = callback;
  }
  snapshot(sessions: SessionSummary[]): void {
    this.onmessage?.({
      data: { type: "snapshot", directory: "/sessions", sessions },
    });
  }
}

const summary: SessionSummary = {
  id: "a",
  path: "/sessions/a.jsonl",
  cwd: "/project",
  created: "2026-01-01T00:00:00Z",
  modified: "2026-01-01T00:00:00Z",
  messageCount: 0,
  firstMessage: "preview",
};
let descriptor: PropertyDescriptor | undefined;
let timeout: ReturnType<typeof spyOn<typeof globalThis, "setTimeout">>;
let clear: ReturnType<typeof spyOn<typeof globalThis, "clearTimeout">>;
let restart: (() => void) | undefined;
let list: SessionList;
let errors: unknown[];

beforeEach(() => {
  descriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    writable: true,
    value: FakeWorker,
  });
  FakeWorker.created = [];
  FakeWorker.failStart = false;
  restart = undefined;
  errors = [];
  const setTimeoutStub = (handler: TimerHandler) => {
    restart = () => {
      if (typeof handler === "function") handler();
    };
    return 1;
  };
  timeout = spyOn(globalThis, "setTimeout").mockImplementation(
    setTimeoutStub as unknown as typeof setTimeout,
  );
  clear = spyOn(globalThis, "clearTimeout").mockImplementation(() => {
    restart = undefined;
  });
  list = new SessionList(new MemorySessionIndex(), (_directory, error) =>
    errors.push(error),
  );
});

afterEach(async () => {
  await list.stop();
  timeout.mockRestore();
  clear.mockRestore();
  if (descriptor) Object.defineProperty(globalThis, "Worker", descriptor);
  else Reflect.deleteProperty(globalThis, "Worker");
});

test("首次查询不等待 Worker，收到快照后查询可见", async () => {
  list.start();
  list.register("one", summary.path);
  expect(await list.query(summary.path)).toEqual({
    sessions: [],
    total: 0,
    hasMore: false,
  });
  FakeWorker.created[0].snapshot([summary]);
  expect((await list.query(summary.path)).sessions).toEqual([summary]);
  expect(await list.query(undefined)).toEqual({
    sessions: [],
    total: 0,
    hasMore: false,
  });
});

test("异常退出延迟重建并重放最新注册，保留快照且忽略旧 Worker 事件", async () => {
  list.start();
  list.register("one", summary.path);
  list.register("two", "/sessions/b.jsonl");
  const old = FakeWorker.created[0];
  old.snapshot([summary]);
  old.close?.();
  expect(old.terminate).toHaveBeenCalledTimes(1);
  expect(timeout).toHaveBeenCalledWith(expect.any(Function), 5000);
  expect((await list.query(summary.path)).sessions).toEqual([summary]);
  list.register("one", "/sessions/switched.jsonl");
  list.unregister("two");
  list.register("three", summary.path);
  list.register("three", undefined);
  restart?.();
  const current = FakeWorker.created[1];
  expect(current.postMessage.mock.calls).toEqual([
    [
      {
        type: "register",
        instanceId: "one",
        sessionFile: "/sessions/switched.jsonl",
      },
    ],
  ]);
  old.snapshot([]);
  old.onerror?.({ message: "late error" });
  old.close?.();
  expect((await list.query(summary.path)).sessions).toEqual([summary]);
  expect(errors).toHaveLength(1);
  expect(current.terminate).not.toHaveBeenCalled();
});

test("启动失败会重试，正常停止取消尚未执行的重建", async () => {
  FakeWorker.failStart = true;
  list.start();
  list.register("one", summary.path);
  expect(errors).toHaveLength(1);
  expect(timeout).toHaveBeenCalledTimes(1);
  restart?.();
  expect(timeout).toHaveBeenCalledTimes(2);
  FakeWorker.failStart = false;
  restart?.();
  expect(FakeWorker.created[0].postMessage).toHaveBeenCalledWith({
    type: "register",
    instanceId: "one",
    sessionFile: summary.path,
  });
  FakeWorker.created[0].onerror?.({ message: "crashed" });
  await list.stop();
  expect(restart).toBeUndefined();
  expect(clear).toHaveBeenCalledTimes(1);
});

test("发送失败触发恢复，正常停止的 Worker 关闭事件不重启", async () => {
  list.start();
  const old = FakeWorker.created[0];
  old.postMessage.mockImplementation(() => {
    throw new Error("send failed");
  });
  list.register("one", summary.path);
  expect(errors).toHaveLength(1);
  restart?.();
  const current = FakeWorker.created[1];
  expect(current.postMessage).toHaveBeenCalledWith({
    type: "register",
    instanceId: "one",
    sessionFile: summary.path,
  });
  const scheduled = timeout.mock.calls.length;
  await list.stop();
  current.close?.();
  expect(timeout).toHaveBeenCalledTimes(scheduled);
  expect(current.terminate).toHaveBeenCalledTimes(1);
});
