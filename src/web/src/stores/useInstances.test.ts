// useInstances store 测试

import { afterEach, describe, expect, test, beforeEach } from "bun:test";
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
  let previous: ReturnType<typeof useInstances.getState>;
  let persisted: string | null;
  beforeEach(() => {
    previous = useInstances.getState();
    persisted = localStorage.getItem("paimon:instances");
    useInstances.setState({ instances: [], instanceListReady: false });
  });
  afterEach(() => {
    useInstances.setState(previous);
    if (persisted === null) localStorage.removeItem("paimon:instances");
    else localStorage.setItem("paimon:instances", persisted);
  });

  test("缓存任务并恢复首屏快照，不持久化 instanceListReady", async () => {
    const inst = {
      ...makeInstance("cached"),
      tasks: [{ name: "one", status: "in_progress" as const }],
    };
    useInstances
      .getState()
      .handleMessage({ type: "instance_list", payload: { instances: [inst] } });
    const saved = localStorage.getItem("paimon:instances");
    expect(saved).not.toBeNull();
    const parsed = JSON.parse(saved!);
    expect(parsed.state.instances[0].tasks).toEqual(inst.tasks);
    expect(parsed.state).not.toHaveProperty("instanceListReady");
    useInstances.setState({ instances: [], instanceListReady: false });
    localStorage.setItem("paimon:instances", saved!);
    await useInstances.persist.rehydrate();
    expect(useInstances.getState().instances[0].tasks).toEqual(inst.tasks);
    expect(useInstances.getState().instanceListReady).toBe(false);
    useInstances
      .getState()
      .handleMessage({
        type: "instance_list",
        payload: { instances: [{ ...inst, tasks: [] }] },
      });
    expect(useInstances.getState().instances[0].tasks).toEqual([]);
    expect(useInstances.getState().instanceListReady).toBe(true);
  });

  test("新注册实例带任务，任务快照按实例隔离并完整替换", () => {
    const one = {
      ...makeInstance("one"),
      tasks: [{ name: "one", status: "pending" as const }],
    };
    const two = {
      ...makeInstance("two"),
      tasks: [{ name: "two", status: "complete" as const }],
    };
    for (const instance of [one, two])
      useInstances
        .getState()
        .handleMessage({
          type: "instance_update",
          payload: { action: "connected", instance },
        });
    expect(useInstances.getState().instances.map((i) => i.tasks)).toEqual([
      one.tasks,
      two.tasks,
    ]);
    useInstances
      .getState()
      .handleMessage({
        type: "instance_update",
        payload: { action: "updated", instance: { ...one, tasks: [] } },
      });
    expect(useInstances.getState().instances.map((i) => i.tasks)).toEqual([
      [],
      two.tasks,
    ]);
    useInstances
      .getState()
      .handleMessage({
        type: "instance_list",
        payload: { instances: [makeInstance("one")] },
      });
    expect(useInstances.getState().instances).toHaveLength(1);
    expect(useInstances.getState().instances[0].tasks).toBeUndefined();
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
