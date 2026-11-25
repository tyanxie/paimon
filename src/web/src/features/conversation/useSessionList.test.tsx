import type {
  HubToBrowserMessage,
  InstanceId,
  SessionListItem,
} from "@protocol/types";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "../../i18n";
import { useWebSocket } from "../../stores/useWebSocket";
import { useConversation } from "./useConversation";
import { useSessionList } from "./useSessionList";
import * as http from "../../utils/authFetch";
import * as toast from "../../components/ui/Toast";

const instanceId = "instance-1" as InstanceId;
const originalSocketState = useWebSocket.getState();
let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useSessionList>;
let listeners: Set<(message: HubToBrowserMessage) => void>;
let fetchSpy: ReturnType<typeof spyOn<typeof http, "authFetch">>;
let requests: {
  url: string;
  resolve: (response: Response) => void;
  signal?: AbortSignal | null;
}[];

function Probe({
  id = instanceId,
  sessionId,
}: { id?: InstanceId; sessionId?: string } = {}) {
  state = useSessionList(id, sessionId);
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
  hasMore = false,
  total?: number,
) {
  const request = requests
    .filter((item) => item.url.includes("/sessions?"))
    .at(-1)!;
  await act(async () =>
    request.resolve(
      Response.json({ sessions, hasMore, total: total ?? sessions.length }),
    ),
  );
}

beforeEach(async () => {
  listeners = new Set();
  requests = [];
  fetchSpy = spyOn(http, "authFetch").mockImplementation(
    (input, init) =>
      new Promise<Response>((resolve) =>
        requests.push({ url: String(input), resolve, signal: init?.signal }),
      ),
  );
  useWebSocket.setState({
    connectionState: "connected",
    send: () => {},
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
  fetchSpy.mockRestore();
  useWebSocket.setState(originalSocketState);
});

describe("session 查询隔离", () => {
  test("同实例的两个页面分别搜索与分页，彼此不修改列表和加载状态", async () => {
    let other: ReturnType<typeof useSessionList>;
    function OtherPage() {
      other = useSessionList(instanceId);
      return null;
    }
    const otherContainer = document.createElement("div");
    document.body.append(otherContainer);
    const otherRoot = createRoot(otherContainer);
    try {
      await act(async () => otherRoot.render(<OtherPage />));
      await act(async () => state.requestSessionList({ filter: "A" }));
      const a = requests.at(-1)!;
      await act(async () => other.requestSessionList({ filter: "B" }));
      const b = requests.at(-1)!;
      await act(async () =>
        b.resolve(
          Response.json({ sessions: [session("B")], total: 1, hasMore: false }),
        ),
      );
      expect(state.sessionListLoading).toBe(true);
      expect(state.sessionList).toEqual([]);
      await act(async () =>
        a.resolve(
          Response.json({ sessions: [session("A")], total: 2, hasMore: true }),
        ),
      );
      await act(async () =>
        state.requestSessionList({ offset: 1, filter: "A" }),
      );
      await response([session("A-older")]);
      expect(state.sessionList.map((item) => item.id)).toEqual([
        "A",
        "A-older",
      ]);
      expect(other!.sessionList.map((item) => item.id)).toEqual(["B"]);
      expect(other!.sessionTotal).toBe(1);
      expect(other!.sessionHasMore).toBe(false);
    } finally {
      await act(async () => otherRoot.unmount());
      otherContainer.remove();
    }
  });

  test("搜索变化取消旧请求，迟到的分页结果不覆盖新搜索或结束其 loading", async () => {
    await act(async () => state.requestSessionList({ filter: "old" }));
    await response([session("old")], true, 2);
    await act(async () =>
      state.requestSessionList({ offset: 1, filter: "old" }),
    );
    const old = requests.at(-1)!;
    await act(async () => state.requestSessionList({ filter: "new" }));
    expect(old.signal?.aborted).toBe(true);
    await act(async () =>
      old.resolve(
        Response.json({
          sessions: [session("old-page")],
          total: 2,
          hasMore: false,
        }),
      ),
    );
    expect(state.sessionList).toEqual([]);
    expect(state.sessionListLoading).toBe(true);
    await response([session("new")]);
    expect(state.sessionList.map((item) => item.id)).toEqual(["new"]);
  });

  test("查询超时结束 loading、保留已有列表并提示错误", async () => {
    const toastSpy = spyOn(toast, "showToast").mockImplementation(() => {});
    try {
      await act(async () => state.requestSessionList());
      await response([session("latest")], true, 2);
      await act(async () => state.requestSessionList({ offset: 1 }));
      await act(async () =>
        requests
          .at(-1)!
          .resolve(
            Response.json(
              { error: "Request timed out (10s)" },
              { status: 502 },
            ),
          ),
      );
      expect(state.sessionListLoading).toBe(false);
      expect(state.sessionList.map((item) => item.id)).toEqual(["latest"]);
      expect(toastSpy).toHaveBeenCalledWith("Request timed out (10s)", "error");
    } finally {
      toastSpy.mockRestore();
    }
  });

  test.each(["instance", "session"] as const)(
    "%s 切换后忽略旧响应，卸载取消当前请求",
    async (change) => {
      await act(async () => root.render(<Probe sessionId="one" />));
      await act(async () => state.requestSessionList());
      const old = requests.at(-1)!;
      await act(async () =>
        root.render(
          <Probe
            id={change === "instance" ? "other" : instanceId}
            sessionId="two"
          />,
        ),
      );
      expect(old.signal?.aborted).toBe(true);
      await act(async () =>
        old.resolve(
          Response.json({
            sessions: [session("old")],
            total: 1,
            hasMore: false,
            sessionId: "one",
          }),
        ),
      );
      expect(state.sessionList).toEqual([]);
      await act(async () => state.requestSessionList());
      const current = requests.at(-1)!;
      await act(async () => root.unmount());
      expect(current.signal?.aborted).toBe(true);
    },
  );
});

describe("session 列表状态", () => {
  test("首次查询替换列表，分页追加并传递过滤参数", async () => {
    await act(async () =>
      state.requestSessionList({ filter: "query", limit: 10 }),
    );
    expect(state.sessionListLoading).toBe(true);
    const url = new URL(requests.at(-1)!.url, "http://localhost");
    expect(url.pathname).toBe(`/api/instance/${instanceId}/sessions`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      offset: "0",
      limit: "10",
      filter: "query",
    });
    await response([session("one")], true, 2);
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

  test("查询只请求当前实例，重连时清空列表并释放订阅", async () => {
    await act(async () => state.requestSessionList());
    expect(new URL(requests.at(-1)!.url, "http://localhost").pathname).toBe(
      `/api/instance/${instanceId}/sessions`,
    );
    await response([session("one")], true, 3);
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
