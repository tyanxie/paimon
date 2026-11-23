import { afterEach, expect, spyOn, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { InstanceId, Task } from "../protocol/types";
import * as logger from "../utils/logger";

// 导入 registry 前阻止日志工厂创建真实文件，不替换 registry 行为
const loggerSpy = spyOn(logger, "createLogger").mockReturnValue({
  info() {},
  warn() {},
  error() {},
  debug() {},
  async shutdown() {},
});
const { edgeRegistry } = await import("./registry");
loggerSpy.mockRestore();
import type { EdgeWsData } from "./registry";
const ids = new Set<InstanceId>();
afterEach(() => {
  for (const id of ids) edgeRegistry.unregister(id);
  ids.clear();
});
const tasks: Task[] = [{ name: "one", status: "in_progress" }];
function register(plan: Task[]) {
  const ws = { data: {}, close() {} } as ServerWebSocket<EdgeWsData>;
  const result = edgeRegistry.register(ws, {
    hostname: "task-registry-test",
    cwd: "/project",
    pid: 999999,
    model: { provider: "test", id: "test" },
    tasks: plan,
  });
  ids.add(result.instanceId);
  return result;
}
test("Edge 注册和重连保留当前任务快照", () => {
  const first = register(tasks);
  expect(first.isReconnect).toBe(false);
  expect(
    edgeRegistry.getAllInstances().find((i) => i.id === first.instanceId)
      ?.tasks,
  ).toEqual(tasks);
  edgeRegistry.startGracePeriod(first.instanceId);
  const updated: Task[] = [{ name: "one", status: "complete" }];
  const second = register(updated);
  expect(second.isReconnect).toBe(true);
  expect(second.instanceId).toBe(first.instanceId);
  expect(edgeRegistry.getInstance(first.instanceId)?.tasks).toEqual(updated);
});
test("Edge 普通状态更新保留任务，空数组明确清空", () => {
  const { instanceId } = register(tasks);
  edgeRegistry.updateState(instanceId, { status: "streaming" });
  expect(edgeRegistry.getInstance(instanceId)?.tasks).toEqual(tasks);
  edgeRegistry.updateState(instanceId, { tasks: [] });
  expect(edgeRegistry.getInstance(instanceId)?.tasks).toEqual([]);
});
