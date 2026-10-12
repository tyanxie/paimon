import { describe, expect, test } from "bun:test";
import type {
  HubInstanceUpdateMessage,
  InstanceInfo,
  SettledOutcome,
} from "../../../protocol/types";
import { isCompletedSettlement } from "./useTaskNotifier";

function makeInstance(): InstanceInfo {
  return {
    id: "instance-1",
    edgeId: "edge-1",
    hostname: "host",
    cwd: "/workspace/project",
    homedir: "/home/user",
    model: { provider: "test", id: "model" },
    pid: 100,
    status: "idle",
    connectedAt: 1,
    lastHeartbeat: 1,
  };
}

function makePayload(
  settledOutcome?: SettledOutcome,
  action: HubInstanceUpdateMessage["payload"]["action"] = "updated",
): HubInstanceUpdateMessage["payload"] {
  return { instance: makeInstance(), action, settledOutcome };
}

describe("isCompletedSettlement", () => {
  test("accepts completed settlement updates", () => {
    expect(isCompletedSettlement(makePayload("completed"))).toBe(true);
  });

  test("ignores aborted and error settlements", () => {
    expect(isCompletedSettlement(makePayload("aborted"))).toBe(false);
    expect(isCompletedSettlement(makePayload("error"))).toBe(false);
  });

  test("ignores ordinary state and connection updates", () => {
    expect(isCompletedSettlement(makePayload())).toBe(false);
    expect(isCompletedSettlement(makePayload("completed", "connected"))).toBe(
      false,
    );
  });
});
