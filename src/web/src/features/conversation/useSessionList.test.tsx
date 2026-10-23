import type {
  HubToBrowserMessage,
  InstanceId,
  SessionListItem,
} from "@protocol/types";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "../../i18n";
import { useWebSocket } from "../../stores/useWebSocket";
import { useConversation } from "./useConversation";
import { useSessionList } from "./useSessionList";

const instanceId = "instance-1" as InstanceId;
const originalSocketState = useWebSocket.getState();
let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useSessionList>;
let listeners: Set<(message: HubToBrowserMessage) => void>;
let sent: unknown[];

function Probe() {
  state = useSessionList(instanceId);
  useConversation(instanceId, undefined, state.resetSessionList);
  return null;
}

function session(id: string): SessionListItem {
  return {
    id,
    path: `/sessions/${id}`,
    name: id,
    cwd: "/project",
    created: new Date(0).toISOString(),
    modified: new Date(0).toISOString(),
    firstMessage: "",
    messageCount: 0,
    isCurrent: false,
  };
}

async function response(
  sessions: SessionListItem[],
  id = instanceId,
  hasMore = false,
  total?: number,
) {
  await act(async () => {
    for (const listener of listeners)
      listener({
        type: "session_list",
        payload: {
          instanceId: id,
          sessions,
          hasMore,
          total: total ?? sessions.length,
        },
      });
  });
}

beforeEach(async () => {
  listeners = new Set();
  sent = [];
  useWebSocket.setState({
    connectionState: "connected",
    send: (message) => {
      sent.push(message);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useWebSocket.setState(originalSocketState);
});

describe("session 列表状态", () => {
  test("首次查询替换列表，分页追加并传递过滤参数", async () => {
    await act(async () =>
      state.requestSessionList({ filter: "query", limit: 10 }),
    );
    expect(state.sessionListLoading).toBe(true);
    expect(sent).toContainEqual({
      type: "list_sessions",
      payload: { instanceId, offset: 0, limit: 10, filter: "query" },
    });
    await response([session("one")], instanceId, true, 2);
    expect(state.sessionHasMore).toBe(true);
    expect(state.sessionTotal).toBe(2);
    await act(async () =>
      state.requestSessionList({ offset: 1, filter: "query" }),
    );
    expect(state.sessionList).toHaveLength(1);
    await response([session("two")]);
    expect(state.sessionList.map((item) => item.id)).toEqual(["one", "two"]);
    expect(state.sessionListLoading).toBe(false);
    await act(async () => state.requestSessionList());
    expect(state.sessionList).toHaveLength(0);
    await response([session("three")]);
    expect(state.sessionList.map((item) => item.id)).toEqual(["three"]);
  });

  test("忽略其他实例，重连时清空列表并释放订阅", async () => {
    await response([session("other")], "other-instance" as InstanceId);
    expect(state.sessionList).toHaveLength(0);
    await response([session("one")], instanceId, true, 3);
    await act(async () =>
      useWebSocket.setState({ connectionState: "disconnected" }),
    );
    await act(async () =>
      useWebSocket.setState({ connectionState: "connected" }),
    );
    expect(state.sessionList).toHaveLength(0);
    expect(state.sessionTotal).toBe(0);
    expect(state.sessionHasMore).toBe(false);
    expect(state.sessionListLoading).toBe(false);
    await act(async () => root.unmount());
    expect(listeners.size).toBe(0);
  });
});
