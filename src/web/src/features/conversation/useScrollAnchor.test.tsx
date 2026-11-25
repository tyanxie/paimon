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
let observers: TestResizeObserver[];
const originalResizeObserver = globalThis.ResizeObserver;

class TestResizeObserver extends ResizeObserver {
  targets = new Set<Element>();
  disconnected = false;

  constructor(private callback: ResizeObserverCallback) {
    super(callback);
    observers.push(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  disconnect() {
    this.disconnected = true;
  }

  notify() {
    if (!this.disconnected) this.callback([], this);
  }
}

function Probe() {
  api = useScrollAnchor(options);
  return null;
}

beforeEach(async () => {
  observers = [];
  globalThis.ResizeObserver = TestResizeObserver;
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
    isLoadingMore: false,
    shouldScrollToBottom: false,
    onScrollToBottomHandled: () => {},
    onLoadMore: () => {
      loads += 1;
      options.isLoadingMore = true;
      root.render(<Probe />);
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
  globalThis.ResizeObserver = originalResizeObserver;
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

async function resizeContent(height: number) {
  Object.defineProperty(scroll, "scrollHeight", {
    value: height,
    configurable: true,
  });
  // 内容缩短时浏览器会限制现有滚动位置，不依赖额外的 scroll 事件
  scroll.scrollTop = scroll.scrollTop;
  await act(async () => {
    observers
      .filter((observer) => observer.targets.has(content))
      .forEach((observer) => observer.notify());
  });
  await frames();
}

describe("历史加载与主动定位", () => {
  test("分页失败停止自动加载，手动重试保留阅读锚点", async () => {
    scroll.scrollTop = 50;
    await act(async () => api.handleScroll());
    expect(loads).toBe(1);
    await act(async () => api.handleScroll());
    expect(loads).toBe(1);
    options.isLoadingMore = false;
    options.onRetryLoadMore = options.onLoadMore;
    options.onLoadMore = undefined;
    await act(async () => root.render(<Probe />));
    expect(scroll.scrollTop).toBe(50);
    expect(options.hasMore).toBe(true);
    for (let i = 0; i < 10; i++) await act(async () => api.handleScroll());
    expect(loads).toBe(1);
    await act(async () => {
      api.retryLoadMore();
      api.retryLoadMore();
    });
    expect(loads).toBe(2);
    // 重试成功时仍恢复本次分页的阅读锚点
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
    options.isLoadingMore = false;
    await act(async () => root.render(<Probe />));
    expect(scroll.scrollTop).toBe(550);
  });
  test("等待历史响应时尺寸通知不改变按钮或触发重复加载", async () => {
    scroll.scrollTop = 0;
    await act(async () => api.handleScroll());
    expect(loads).toBe(1);
    await resizeContent(500);
    expect(api.showScrollBtn).toBe(true);
    expect(loads).toBe(1);
  });

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
      options.isLoadingMore = false;
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
    expect(api.showScrollBtn).toBe(true);
  });

  test("收起后被滚动范围限制在底部时隐藏按钮，后续展开仍保留阅读锚点", async () => {
    await act(async () => api.prepareForContentResize(button));
    // 等待锚点预热结束，覆盖后续动画帧的 ResizeObserver 通知
    await frames();
    await frames();
    await resizeContent(700);
    expect(scroll.scrollTop).toBe(200);
    expect(api.showScrollBtn).toBe(false);
    expect(loads).toBe(0);

    await act(async () => api.prepareForContentResize(button));
    await resizeContent(2000);
    expect(scroll.scrollTop).toBe(200);
    expect(button.getBoundingClientRect().top).toBe(300);
    expect(api.showScrollBtn).toBe(true);
    expect(loads).toBe(0);
  });

  test("收起后内容不足一屏时隐藏按钮且不加载历史", async () => {
    await act(async () => api.prepareForContentResize(button));
    await resizeContent(400);
    expect(scroll.scrollTop).toBe(0);
    expect(api.showScrollBtn).toBe(false);
    expect(loads).toBe(0);
  });

  test("没有阅读锚点的内容缩短也同步按钮", async () => {
    await resizeContent(800);
    expect(scroll.scrollTop).toBe(300);
    expect(api.showScrollBtn).toBe(false);
    expect(loads).toBe(0);
  });

  test("锚点恢复后仍未到底部时不误隐藏按钮", async () => {
    await act(async () => api.prepareForContentResize(button));
    buttonTop = 400;
    await resizeContent(800);
    expect(scroll.scrollTop).toBe(200);
    expect(api.showScrollBtn).toBe(true);
    expect(loads).toBe(0);
  });

  test("原本在底部时内容增长仍自动跟随", async () => {
    await act(async () => api.scrollToBottom());
    await frames();
    await resizeContent(2400);
    expect(scroll.scrollTop).toBe(1900);
    expect(api.showScrollBtn).toBe(false);
    expect(loads).toBe(0);
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
