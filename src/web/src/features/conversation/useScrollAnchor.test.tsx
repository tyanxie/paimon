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

beforeEach(async () => {
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
  const options = {
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
  function Probe() {
    api = useScrollAnchor(options);
    return null;
  }
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
