// useInstances store 测试

import { describe, expect, test, beforeEach } from "bun:test";
import type { InstanceId, InstanceInfo } from "../../../protocol/types";
import { useInstances } from "./useInstances";

function makeInstance(id: string): InstanceInfo {
  return {
    id: id as InstanceId,
    edgeId: "edge-1",
    hostname: "localhost",
    cwd: `/home/user/${id}`,
    homedir: "/home/user",
    model: { provider: "test", id: "model-1", name: "Test Model" },
    pid: 1000,
    status: "idle",
    connectedAt: Date.now(),
    lastHeartbeat: Date.now(),
  } as InstanceInfo;
}

describe("useInstances store", () => {
  beforeEach(() => {
    useInstances.setState({ instances: [], instanceListReady: false });
  });

  test("instance_list 消息设置实例列表并标记 ready", () => {
    const { handleMessage } = useInstances.getState();
    const inst = makeInstance("a");

    handleMessage({
      type: "instance_list",
      payload: { instances: [inst] },
    });

    const state = useInstances.getState();
    expect(state.instances).toHaveLength(1);
    expect(state.instances[0].id).toBe("a");
    expect(state.instanceListReady).toBe(true);
  });

  test("instance_update connected 新增实例", () => {
    const { handleMessage } = useInstances.getState();
    const inst = makeInstance("new");

    handleMessage({
      type: "instance_update",
      payload: { instance: inst, action: "connected" },
    });

    expect(useInstances.getState().instances).toHaveLength(1);
    expect(useInstances.getState().instances[0].id).toBe("new");
  });

  test("instance_update connected 已存在则替换", () => {
    useInstances.setState({ instances: [makeInstance("a")] });
    const updated = { ...makeInstance("a"), status: "streaming" as const };

    useInstances.getState().handleMessage({
      type: "instance_update",
      payload: { instance: updated, action: "connected" },
    });

    expect(useInstances.getState().instances).toHaveLength(1);
    expect(useInstances.getState().instances[0].status).toBe("streaming");
  });

  test("instance_update disconnected 移除实例", () => {
    useInstances.setState({
      instances: [makeInstance("a"), makeInstance("b")],
    });

    useInstances.getState().handleMessage({
      type: "instance_update",
      payload: { instance: makeInstance("a"), action: "disconnected" },
    });

    const ids = useInstances.getState().instances.map((i) => i.id);
    expect(ids).toEqual(["b"]);
  });

  test("instance_update updated 更新已有实例", () => {
    useInstances.setState({ instances: [makeInstance("a")] });
    const updated = { ...makeInstance("a"), status: "compacting" as const };

    useInstances.getState().handleMessage({
      type: "instance_update",
      payload: { instance: updated, action: "updated" },
    });

    expect(useInstances.getState().instances[0].status).toBe("compacting");
  });
});
