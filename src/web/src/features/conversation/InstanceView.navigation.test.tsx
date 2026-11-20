import type {
  BrowserToHubMessage,
  HubToBrowserMessage,
  InstanceInfo,
} from "@protocol/types";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { MotionConfig } from "motion/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import i18n from "../../i18n";
import { useDrafts } from "../../stores/useDrafts";
import { useInstances } from "../../stores/useInstances";
import { useSidebar } from "../../stores/useSidebar";
import { useWebSocket } from "../../stores/useWebSocket";
import { InstanceView } from "./InstanceView";

function instance(id: string): InstanceInfo {
  return {
    id,
    edgeId: "edge",
    hostname: "host",
    cwd: `/projects/${id}`,
    homedir: "/home",
    pid: 1,
    status: "idle",
    model: { provider: "provider", id: "model" },
    connectedAt: 0,
    lastHeartbeat: 0,
    sessionId: `${id}-session`,
  };
}

let root: Root;
let container: HTMLDivElement;
let trigger: HTMLButtonElement;
let navigate: ReturnType<typeof useNavigate>;
let selected: string[];
let sentMessages: BrowserToHubMessage[];
let listeners: Set<(message: HubToBrowserMessage) => void>;
let desktop: boolean;
let coarsePointer: boolean;
let mediaSpy: ReturnType<typeof spyOn>;
let socketState: ReturnType<typeof useWebSocket.getState>;
let instancesState: ReturnType<typeof useInstances.getState>;
let draftsState: ReturnType<typeof useDrafts.getState>;
let sidebarState: ReturnType<typeof useSidebar.getState>;
let persisted: Map<string, string | null>;
let language: string;
let overlay: HTMLElement | undefined;

function Harness() {
  navigate = useNavigate();
  return (
    <Routes>
      <Route
        path="/instance/:id"
        element={
          <InstanceView
            onSelectInstance={(id) => {
              selected.push(id);
              navigate(`/instance/${id}`);
            }}
          />
        }
      />
    </Routes>
  );
}

async function render() {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <MemoryRouter initialEntries={["/instance/one"]}>
          <Harness />
        </MemoryRouter>
      </MotionConfig>,
    ),
  );
}

function editor() {
  return container.querySelector<HTMLTextAreaElement>(".composer-editor")!;
}

async function key(value: string) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: value,
  });
  await act(async () => editor().dispatchEvent(event));
  return event;
}

async function updateInstance(id: string, changes: Partial<InstanceInfo>) {
  await act(async () =>
    useInstances.setState((state) => ({
      instances: state.instances.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    })),
  );
}

async function emit(message: HubToBrowserMessage) {
  await act(async () => {
    for (const listener of listeners) listener(message);
  });
}

beforeEach(async () => {
  socketState = useWebSocket.getState();
  instancesState = useInstances.getState();
  draftsState = useDrafts.getState();
  sidebarState = useSidebar.getState();
  persisted = new Map(
    ["paimon:instances", "paimon:sidebar"].map((key) => [
      key,
      localStorage.getItem(key),
    ]),
  );
  language = i18n.language;
  await i18n.changeLanguage("zh-CN");
  selected = [];
  sentMessages = [];
  listeners = new Set();
  desktop = true;
  coarsePointer = false;
  overlay = undefined;
  const original = window.matchMedia.bind(window);
  const query = original("(min-width: 768px)");
  Object.defineProperty(query, "matches", {
    configurable: true,
    get: () => desktop,
  });
  const pointerQuery = original("(pointer: coarse)");
  Object.defineProperty(pointerQuery, "matches", {
    configurable: true,
    get: () => coarsePointer,
  });
  mediaSpy = spyOn(window, "matchMedia").mockImplementation((value) =>
    value === query.media
      ? query
      : value === pointerQuery.media
        ? pointerQuery
        : original(value),
  );
  useInstances.setState({
    instances: [instance("one"), instance("two")],
    instanceListReady: true,
  });
  useDrafts.setState({ drafts: new Map() });
  useSidebar.setState({ collapsedEdges: {} });
  useWebSocket.setState({
    connectionState: "connected",
    send: (message) => {
      sentMessages.push(message);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
  container = document.createElement("div");
  trigger = document.createElement("button");
  document.body.append(container, trigger);
  trigger.focus();
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  if (overlay instanceof HTMLDialogElement) overlay.close();
  overlay?.remove();
  container.remove();
  trigger.remove();
  mediaSpy.mockRestore();
  useWebSocket.setState(socketState);
  useInstances.setState(instancesState);
  useDrafts.setState(draftsState);
  useSidebar.setState(sidebarState);
  for (const [key, value] of persisted) {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  }
  await i18n.changeLanguage(language);
});

describe("实例页面导航与自动聚焦", () => {
  test("上下键使用传入的实例导航入口，切换后恢复焦点和草稿", async () => {
    useDrafts.getState().setDraft("two", { text: "saved draft", images: [] });
    await render();
    expect(document.activeElement).toBe(editor());
    const previous = editor();
    await key("ArrowDown");
    expect(selected).toEqual(["two"]);
    expect(editor()).not.toBe(previous);
    expect(document.activeElement).toBe(editor());
    expect(editor().value).toBe("saved draft");
    expect(editor().selectionStart).toBe("saved draft".length);
    expect(editor().selectionEnd).toBe("saved draft".length);
    trigger.focus();
    await act(async () => navigate("/instance/one"));
    expect(editor().value).toBe("");
    expect(document.activeElement).toBe(editor());
  });

  test("窄屏、实例列表未确认或连接不可用时，不调用导航入口", async () => {
    await render();
    const currentEditor = editor();
    desktop = false;
    for (const value of ["ArrowUp", "ArrowDown"]) {
      expect((await key(value)).defaultPrevented).toBe(false);
    }
    expect(selected).toEqual([]);
    expect(editor()).toBe(currentEditor);
    expect(document.activeElement).toBe(currentEditor);
    desktop = true;
    await act(async () => useInstances.setState({ instanceListReady: false }));
    expect((await key("ArrowDown")).defaultPrevented).toBe(false);
    await act(async () => {
      useInstances.setState({ instanceListReady: true });
      useWebSocket.setState({ connectionState: "disconnected" });
    });
    expect((await key("ArrowDown")).defaultPrevented).toBe(false);
    expect(selected).toEqual([]);
  });

  test("桌面端切换 session 聚焦重建的输入框并保留草稿", async () => {
    useDrafts.getState().setDraft("one", { text: "unfinished", images: [] });
    await render();
    const previous = editor();
    trigger.focus();
    await updateInstance("one", { sessionId: "new-session" });
    expect(editor()).not.toBe(previous);
    expect(document.activeElement).toBe(editor());
    expect(editor().value).toBe("unfinished");
    expect(editor().selectionStart).toBe("unfinished".length);
  });

  test("普通状态、草稿、历史和消息更新不重新抢走焦点", async () => {
    await render();
    trigger.focus();
    await updateInstance("one", { status: "streaming" });
    expect(document.activeElement).toBe(trigger);
    await act(async () =>
      useDrafts.getState().setDraft("one", { text: "draft", images: [] }),
    );
    expect(editor().value).toBe("draft");
    expect(document.activeElement).toBe(trigger);
    await emit({
      type: "history",
      payload: { instanceId: "one", messages: [], hasMore: false },
    });
    expect(
      container
        .querySelector(".conversation-scroll")!
        .getAttribute("aria-busy"),
    ).toBe("false");
    expect(document.activeElement).toBe(trigger);
    await emit({
      type: "forwarded_event",
      payload: {
        instanceId: "one",
        event: "message_end",
        data: {
          message: {
            role: "user",
            content: [{ type: "text", text: "hello" }],
            timestamp: 1,
          },
        },
        timestamp: 1,
      },
    });
    expect(container.textContent).toContain("hello");
    expect(document.activeElement).toBe(trigger);
  });

  test.each([
    { wide: false, coarse: false },
    { wide: true, coarse: true },
  ])(
    "窄屏或 coarse pointer 设备进入页面、切换实例和 session 不自动聚焦：%j",
    async ({ wide, coarse }) => {
      desktop = wide;
      coarsePointer = coarse;
      await render();
      expect(document.activeElement).toBe(trigger);
      await act(async () => navigate("/instance/two"));
      expect(document.activeElement).toBe(trigger);
      await updateInstance("two", { sessionId: "new-session" });
      expect(document.activeElement).toBe(trigger);
    },
  );

  test.each(["dialog", "menu"])(
    "%s 正在交互时，页面和 session 变化不抢焦点",
    async (role) => {
      overlay = document.createElement("div");
      overlay.setAttribute("role", role);
      const input = document.createElement("input");
      overlay.append(input);
      document.body.append(overlay);
      input.focus();
      await render();
      expect(document.activeElement).toBe(input);
      await updateInstance("one", { sessionId: "new-session" });
      expect(document.activeElement).toBe(input);
      await act(async () => navigate("/instance/two"));
      expect(document.activeElement).toBe(input);
    },
  );

  test("原生 dialog 打开时，即使焦点不在其中也不自动聚焦输入框", async () => {
    overlay = document.createElement("dialog");
    overlay.setAttribute("open", "");
    document.body.append(overlay);
    trigger.focus();
    await render();
    expect(document.activeElement).toBe(trigger);
    await updateInstance("one", { sessionId: "new-session" });
    expect(document.activeElement).toBe(trigger);
  });
});

describe("实例页面发送与滚动", () => {
  async function prepareReadingPosition() {
    await render();
    await emit({
      type: "history",
      payload: {
        instanceId: "one",
        messages: [
          {
            type: "message",
            id: "old",
            message: { role: "user", content: "previous" },
          },
        ],
        hasMore: false,
      },
    });
    await act(
      async () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    const scroll = container.querySelector<HTMLDivElement>(
      ".conversation-scroll",
    )!;
    const writes: { questionVisible: boolean; waitingVisible: boolean }[] = [];
    let scrollTop = 300;
    Object.defineProperties(scroll, {
      scrollHeight: { configurable: true, value: 2000 },
      clientHeight: { configurable: true, value: 500 },
      scrollTop: {
        configurable: true,
        get: () => scrollTop,
        set: (value: number) => {
          scrollTop = Math.max(
            0,
            Math.min(value, scroll.scrollHeight - scroll.clientHeight),
          );
          writes.push({
            questionVisible:
              container.textContent?.includes("new question") ?? false,
            waitingVisible:
              container.querySelector(".conversation-reply-pending") !== null,
          });
        },
      },
    });
    await act(async () =>
      scroll.dispatchEvent(new Event("scroll", { bubbles: true })),
    );
    return { scroll, writes };
  }

  test("主动发送在用户占位与等待进入 DOM 后定位，并阻止待确认期间重复发送", async () => {
    const { scroll, writes } = await prepareReadingPosition();
    await act(async () =>
      useDrafts
        .getState()
        .setDraft("one", { text: "new question", images: [] }),
    );
    await key("Enter");
    expect(sentMessages.filter((message) => message.type === "prompt")).toEqual(
      [
        {
          type: "prompt",
          payload: {
            instanceId: "one",
            message: "new question",
            images: undefined,
          },
        },
      ],
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(
      writes.every((write) => write.questionVisible && write.waitingVisible),
    ).toBe(true);
    expect(scroll.scrollTop).toBe(1500);
    expect(editor().value).toBe("");
    await act(async () =>
      useDrafts.getState().setDraft("one", { text: "duplicate", images: [] }),
    );
    await key("Enter");
    expect(
      sentMessages.filter((message) => message.type === "prompt"),
    ).toHaveLength(1);
    expect(editor().value).toBe("duplicate");
  });

  test("只收到用户消息和流式输出时保留历史阅读位置", async () => {
    const { scroll, writes } = await prepareReadingPosition();
    await emit({
      type: "forwarded_event",
      payload: {
        instanceId: "one",
        event: "message_end",
        data: { message: { role: "user", content: "new question" } },
        timestamp: 1,
      },
    });
    await updateInstance("one", { status: "streaming" });
    await emit({
      type: "forwarded_event",
      payload: {
        instanceId: "one",
        event: "message_start",
        data: {
          message: {
            role: "assistant",
            content: [{ type: "text", text: "answer" }],
          },
        },
        timestamp: 2,
      },
    });
    expect(container.textContent).toContain("answer");
    expect(scroll.scrollTop).toBe(300);
    expect(writes).toHaveLength(0);
  });

  test("连接不可用时不发送、不清空草稿，也不触发发送定位", async () => {
    const { scroll, writes } = await prepareReadingPosition();
    await act(async () => {
      useDrafts
        .getState()
        .setDraft("one", { text: "new question", images: [] });
      useWebSocket.setState({ connectionState: "disconnected" });
    });
    await key("Enter");
    expect(
      sentMessages.filter((message) => message.type === "prompt"),
    ).toHaveLength(0);
    expect(editor().value).toBe("new question");
    expect(scroll.scrollTop).toBe(300);
    expect(writes).toHaveLength(0);
    expect(container.querySelector(".conversation-reply-pending")).toBeNull();
  });
});
