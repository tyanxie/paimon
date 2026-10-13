import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type {
  EdgeInstanceRegisterMessage,
  HubToBrowserMessage,
  InstanceStatus,
} from "../protocol/types";
import { hubRegistry, type WsData } from "./edge";
import { handleEdgeMessage } from "./router";

const instanceId = "registration-status-test";
let broadcasts: HubToBrowserMessage[];
let browser: ServerWebSocket<WsData>;

const edge = {
  data: { role: "edge", edgeId: "test-edge" },
} as ServerWebSocket<WsData>;

function registerInstance(status?: InstanceStatus): void {
  const message: EdgeInstanceRegisterMessage = {
    type: "instance_register",
    payload: {
      instanceId,
      hostname: "localhost",
      cwd: "/home/user/project",
      model: { provider: "test", id: "model" },
      pid: 1234,
      status,
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
