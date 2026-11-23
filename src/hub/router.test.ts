import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type {
  EdgeInstanceRegisterMessage,
  HubToBrowserMessage,
  InstanceStatus,
  Task,
} from "../protocol/types";
import type { WsData } from "./edge";
import * as logger from "../utils/logger";

// 导入 Hub 模块前隔离文件日志，不启动真实服务
const loggerSpy = spyOn(logger, "createLogger").mockReturnValue({
  info() {},
  warn() {},
  error() {},
  debug() {},
  async shutdown() {},
});
const { hubRegistry } = await import("./edge");
const { handleEdgeMessage } = await import("./router");
loggerSpy.mockRestore();

const instanceId = "registration-status-test";
let broadcasts: HubToBrowserMessage[];
let browser: ServerWebSocket<WsData>;

const edge = {
  data: { role: "edge", edgeId: "test-edge" },
} as ServerWebSocket<WsData>;

function registerInstance(status?: InstanceStatus, tasks?: Task[]): void {
  const message: EdgeInstanceRegisterMessage = {
    type: "instance_register",
    payload: {
      instanceId,
      hostname: "localhost",
      cwd: "/home/user/project",
      model: { provider: "test", id: "model" },
      pid: 1234,
      status,
      tasks,
    },
  };
  handleEdgeMessage(edge, JSON.stringify(message));
}

beforeEach(() => {
  broadcasts = [];
  browser = {
    data: { role: "browser" },
    send(payload: string) {
      broadcasts.push(JSON.parse(payload));
      return payload.length;
    },
  } as ServerWebSocket<WsData>;
  hubRegistry.addBrowser(browser);
});

afterEach(() => {
  hubRegistry.removeBrowser(browser);
  hubRegistry.unregisterInstance(instanceId);
});

describe("任务快照同步", () => {
  const tasks: Task[] = [{ name: "one", status: "in_progress" }];
  test("注册及回复开始重新注册均保存并广播任务", () => {
    registerInstance("idle", tasks);
    expect(hubRegistry.getInstance(instanceId)?.tasks).toEqual(tasks);
    expect(broadcasts[0]).toMatchObject({
      payload: { action: "connected", instance: { tasks } },
    });
    broadcasts.length = 0;
    registerInstance("streaming", tasks);
    expect(hubRegistry.getInstance(instanceId)?.tasks).toEqual(tasks);
    expect(broadcasts[0]).toMatchObject({
      payload: { action: "updated", instance: { tasks } },
    });
  });
  test("普通状态更新保留任务，新快照和空数组同步替换", () => {
    registerInstance("idle", tasks);
    for (const state of [
      { status: "streaming" },
      { tasks: [{ name: "one", status: "complete" as const }] },
      { tasks: [] },
    ]) {
      broadcasts.length = 0;
      handleEdgeMessage(
        edge,
        JSON.stringify({
          type: "instance_state",
          payload: { instanceId, ...state },
        }),
      );
      const expected = "tasks" in state ? state.tasks : tasks;
      expect(hubRegistry.getInstance(instanceId)?.tasks).toEqual(expected);
      expect(broadcasts[0]).toMatchObject({
        payload: { instance: { tasks: expected } },
      });
    }
  });
  test("重新注册的空计划清除旧任务", () => {
    registerInstance("idle", tasks);
    registerInstance("idle", []);
    expect(hubRegistry.getInstance(instanceId)?.tasks).toEqual([]);
    expect(broadcasts.at(-1)).toMatchObject({
      payload: { instance: { tasks: [] } },
    });
  });
});

describe("实例注册状态同步", () => {
  for (const status of ["streaming", "compacting", "idle"] as const) {
    test(`全新实例注册时保存并广播 ${status}`, () => {
      registerInstance(status);

      expect(hubRegistry.getInstance(instanceId)?.status).toBe(status);
      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0]).toMatchObject({
        type: "instance_update",
        payload: { action: "connected", instance: { status } },
      });
      expect(broadcasts[0]).not.toHaveProperty("payload.settledOutcome");
    });
  }

  for (const [previous, current] of [
    ["idle", "streaming"],
    ["streaming", "compacting"],
    ["streaming", "idle"],
  ] as const) {
    test(`已有实例重新注册时从 ${previous} 更新为 ${current}`, () => {
      registerInstance(previous);
      broadcasts.length = 0;

      registerInstance(current);

      expect(hubRegistry.getInstance(instanceId)?.status).toBe(current);
      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0]).toMatchObject({
        type: "instance_update",
        payload: { action: "updated", instance: { status: current } },
      });
      expect(broadcasts[0]).not.toHaveProperty("payload.settledOutcome");
    });
  }

  test("全新实例注册时未携带状态则保存并广播 idle", () => {
    registerInstance();

    expect(hubRegistry.getInstance(instanceId)?.status).toBe("idle");
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]).toMatchObject({
      type: "instance_update",
      payload: { action: "connected", instance: { status: "idle" } },
    });
    expect(broadcasts[0]).not.toHaveProperty("payload.settledOutcome");
  });

  for (const status of ["streaming", "compacting", "idle"] as const) {
    test(`已有实例重新注册时未携带状态则保留 ${status}`, () => {
      registerInstance(status);
      broadcasts.length = 0;

      registerInstance();

      expect(hubRegistry.getInstance(instanceId)?.status).toBe(status);
      expect(broadcasts).toHaveLength(1);
      expect(broadcasts[0]).toMatchObject({
        type: "instance_update",
        payload: { action: "updated", instance: { status } },
      });
      expect(broadcasts[0]).not.toHaveProperty("payload.settledOutcome");
    });
  }

  test("运行中注册后正常接收任务结束状态", () => {
    registerInstance("streaming");
    broadcasts.length = 0;

    handleEdgeMessage(
      edge,
      JSON.stringify({
        type: "instance_state",
        payload: { instanceId, status: "idle", settledOutcome: "completed" },
      }),
    );

    expect(hubRegistry.getInstance(instanceId)?.status).toBe("idle");
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]).toMatchObject({
      type: "instance_update",
      payload: {
        action: "updated",
        instance: { status: "idle" },
        settledOutcome: "completed",
      },
    });
  });
});
