import type { InstanceInfo } from "@protocol/types";
import { describe, expect, test } from "bun:test";
import {
  getAdjacentInstanceId,
  groupInstancesByEdge,
} from "./instanceNavigation";

function instance(id: string, edgeId: string): InstanceInfo {
  return {
    id,
    edgeId,
    hostname: "host",
    cwd: "/project",
    homedir: "/home",
    pid: 1,
    status: "idle",
    model: { provider: "provider", id: "model" },
    connectedAt: 0,
    lastHeartbeat: 0,
  };
}

const instances = [
  instance("z-one", "edge-z"),
  instance("b-one", "edge-b"),
  instance("a-one", "edge-a"),
  instance("z-two", "edge-z"),
  instance("a-two", "edge-a"),
  instance("b-two", "edge-b"),
];

const order = ["a-one", "a-two", "b-one", "b-two", "z-one", "z-two"];

describe("实例列表顺序与相邻导航", () => {
  test("按 Edge 名称分组排序，组内保留原始顺序和对象", () => {
    const original = [...instances];
    const groups = groupInstancesByEdge(instances);
    expect(groups.map(([edgeId]) => edgeId)).toEqual([
      "edge-a",
      "edge-b",
      "edge-z",
    ]);
    expect(groups.flatMap(([, group]) => group.map((item) => item.id))).toEqual(
      order,
    );
    expect(groups[0]?.[1][0]).toBe(instances[2]);
    expect(groups[0]?.[1][1]).toBe(instances[4]);
    expect(instances).toEqual(original);
  });

  test("前后查找使用与分组列表一致的顺序，首尾不循环", () => {
    for (const [index, id] of order.entries()) {
      expect(getAdjacentInstanceId(instances, id, -1, {})).toBe(
        order[index - 1],
      );
      expect(getAdjacentInstanceId(instances, id, 1, {})).toBe(
        order[index + 1],
      );
    }
  });

  test("跳过折叠组，包括当前实例位于折叠组的情况", () => {
    const collapsed = { "edge-b": true };
    expect(getAdjacentInstanceId(instances, "a-two", 1, collapsed)).toBe(
      "z-one",
    );
    expect(getAdjacentInstanceId(instances, "z-one", -1, collapsed)).toBe(
      "a-two",
    );
    expect(getAdjacentInstanceId(instances, "b-one", 1, collapsed)).toBe(
      "z-one",
    );
    expect(getAdjacentInstanceId(instances, "b-two", -1, collapsed)).toBe(
      "a-two",
    );
    expect(
      getAdjacentInstanceId(instances, "a-two", 1, {
        "edge-b": true,
        "edge-z": true,
      }),
    ).toBeUndefined();
  });

  test("空列表或未知当前实例不产生导航目标", () => {
    expect(groupInstancesByEdge([])).toEqual([]);
    for (const offset of [-1, 1] as const) {
      expect(getAdjacentInstanceId([], "missing", offset, {})).toBeUndefined();
      expect(
        getAdjacentInstanceId(instances, "missing", offset, {}),
      ).toBeUndefined();
    }
  });
});
