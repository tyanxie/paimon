import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SessionEntry } from "./types";
import { useScrollAnchor, type UseScrollAnchorReturn } from "./useScrollAnchor";

let root: Root;
let mount: HTMLDivElement;
let scroll: HTMLDivElement;
let content: HTMLDivElement;
let chrome: HTMLDivElement;
let button: HTMLButtonElement;
let api: UseScrollAnchorReturn;
let buttonTop: number;
let loads: number;
let options: Parameters<typeof useScrollAnchor>[0];
let elementsFromPointDescriptor: PropertyDescriptor | undefined;

function Probe() {
  api = useScrollAnchor(options);
  return null;
}

beforeEach(async () => {
  elementsFromPointDescriptor = Object.getOwnPropertyDescriptor(
    document,
    "elementsFromPoint",
  );
  // happy-dom 不提供布局命中查询，此处使用条目级锚点
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => [],
  });
  mount = document.createElement("div");
  scroll = document.createElement("div");
  content = document.createElement("div");
  chrome = document.createElement("div");
  button = document.createElement("button");
  content.dataset.entryKey = "execution:a1";
  content.append(button);
  scroll.append(content);
  document.body.append(mount, scroll, chrome);
  const entries: SessionEntry[] = [
    { type: "message", id: "a1", message: { role: "assistant", content: [] } },
  ];
  options = {
    scrollRef: { current: scroll },
    contentRef: { current: content },
    bottomChromeRef: { current: chrome },
    entries,
    entriesRef: { current: entries },
    instanceId: "instance",
    hasMore: true,
    shouldScrollToBottom: false,
    onScrollToBottomHandled: () => {},
    onLoadMore: () => {
      loads += 1;
    },
    bottomChromeHeight: 80,
    bottomSafeGap: 0,
  };
  loads = 0;
  root = createRoot(mount);
  await act(async () => root.render(<Probe />));
  Object.defineProperty(scroll, "scrollHeight", {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(scroll, "clientHeight", {
    value: 500,
    configurable: true,
  });
  let scrollTop = 0;
  // 模拟浏览器对 scrollTop 的范围限制
  Object.defineProperty(scroll, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = Math.max(
        0,
        Math.min(value, scroll.scrollHeight - scroll.clientHeight),
      );
    },
  });
  scroll.getBoundingClientRect = () => new DOMRect(0, 0, 300, 500);
  buttonTop = 500;
  button.getBoundingClientRect = () =>
    new DOMRect(0, buttonTop - scroll.scrollTop, 200, 40);
  content.getBoundingClientRect = () => button.getBoundingClientRect();
  chrome.getBoundingClientRect = () => new DOMRect(0, 500, 300, 80);
  scroll.scrollTop = 300;
  await act(async () => api.handleScroll());
});

afterEach(async () => {
  await act(async () => root.unmount());
  mount.remove();
  scroll.remove();
  chrome.remove();
  if (elementsFromPointDescriptor) {
    Object.defineProperty(
      document,
      "elementsFromPoint",
      elementsFromPointDescriptor,
    );
  } else {
    Reflect.deleteProperty(document, "elementsFromPoint");
  }
});

async function frames() {
  await act(
    async () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      }),
  );
}

describe("历史加载与主动定位", () => {
  test.each([{ jumpToBottom: false }, { jumpToBottom: true }])(
    "历史响应遵循最新阅读选择：%j",
    async ({ jumpToBottom }) => {
      await frames();
      buttonTop = 100;
      scroll.scrollTop = 0;
      await act(async () => api.handleScroll());
      expect(loads).toBe(1);
      if (jumpToBottom) {
        await act(async () => api.scrollToBottom());
        expect(api.showScrollBtn).toBe(false);
      }
      buttonTop += 500;
      Object.defineProperty(scroll, "scrollHeight", {
        value: 2500,
        configurable: true,
      });
      options.entries = [
        {
          type: "message",
          id: "older",
          message: { role: "user", content: "old" },
        },
        ...options.entries,
      ];
      options.entriesRef.current = options.entries;
      await act(async () => root.render(<Probe />));
      await frames();
      expect(scroll.scrollTop).toBe(jumpToBottom ? 2000 : 500);
      expect(loads).toBe(1);
    },
  );
});

describe("折叠阅读位置", () => {
  test("内容高度变化时保持点击入口在视口中的位置", async () => {
    expect(api.showScrollBtn).toBe(true);
    await act(async () => api.prepareForContentResize(button));
    buttonTop = 460;
    await frames();
    expect(scroll.scrollTop).toBe(260);
    expect(button.getBoundingClientRect().top).toBe(200);
  });

  test("用户继续滚动时结束固定阅读位置", async () => {
    await act(async () => api.prepareForContentResize(button));
    await frames();
    scroll.scrollTop = 350;
    await act(async () => api.handleScroll());
    buttonTop = 460;
    await frames();
    expect(scroll.scrollTop).toBe(350);
  });

  test("折叠引起的顶部位置变化保持历史加载限制", async () => {
    await act(async () => api.prepareForContentResize(button));
    scroll.scrollTop = 0;
    await act(async () => api.handleScroll());
    expect(loads).toBe(0);
  });
});
