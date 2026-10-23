import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useConversationChrome } from "./useConversationChrome";

let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useConversationChrome>;
let heights: { top: number; bottom: number; gap: number };
let observers: TestResizeObserver[];
const originalResizeObserver = globalThis.ResizeObserver;

class TestResizeObserver extends ResizeObserver {
  target: Element | null = null;
  disconnected = false;
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    super(callback);
    this.callback = callback;
    observers.push(this);
  }

  observe(target: Element) {
    this.target = target;
  }

  disconnect() {
    this.disconnected = true;
  }

  notify() {
    this.callback([], this);
  }
}

function Probe({
  instanceId = "one",
  elements = true,
}: {
  instanceId?: string;
  elements?: boolean;
}) {
  state = useConversationChrome(instanceId);
  if (!elements) return null;
  return (
    <>
      <div
        ref={(element) => {
          state.topChromeRef.current = element;
          if (element)
            element.getBoundingClientRect = () =>
              new DOMRect(0, 0, 300, heights.top);
        }}
      />
      <div
        ref={(element) => {
          state.bottomChromeRef.current = element;
          if (element)
            element.getBoundingClientRect = () =>
              new DOMRect(0, 0, 300, heights.bottom);
        }}
      />
      <div
        ref={(element) => {
          state.bottomSafeGapRef.current = element;
          if (element)
            element.getBoundingClientRect = () =>
              new DOMRect(0, 0, 300, heights.gap);
        }}
      />
    </>
  );
}

beforeEach(() => {
  observers = [];
  heights = { top: 63.2, bottom: 95.2, gap: 11.2 };
  globalThis.ResizeObserver = TestResizeObserver;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.ResizeObserver = originalResizeObserver;
});

describe("对话控制区域尺寸观察", () => {
  test("未提供元素时保留初始尺寸和间距", async () => {
    await act(async () => root.render(<Probe elements={false} />));
    expect(state.topChromeHeight).toBe(64);
    expect(state.bottomChromeHeight).toBe(96);
    expect(state.bottomSafeGap).toBe(12);
    expect(state.scrollSpacing).toEqual({
      paddingTop: 80,
      paddingBottom: 96,
      scrollButtonBottom: 108,
    });
    expect(observers).toHaveLength(0);
  });

  test("初始测量和尺寸通知保持向上取整及间距计算", async () => {
    await act(async () => root.render(<Probe />));
    expect(observers).toHaveLength(3);
    expect(state.topChromeHeight).toBe(64);
    heights = { top: 80.1, bottom: 150.2, gap: 20.3 };
    await act(async () => observers.forEach((observer) => observer.notify()));
    expect(state.topChromeHeight).toBe(81);
    expect(state.bottomChromeHeight).toBe(151);
    expect(state.bottomSafeGap).toBe(21);
    expect(state.scrollSpacing).toEqual({
      paddingTop: 97,
      paddingBottom: 142,
      scrollButtonBottom: 163,
    });
  });

  test("缺少 ResizeObserver 时保留首次尺寸测量", async () => {
    Object.defineProperty(globalThis, "ResizeObserver", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    heights = { top: 80.1, bottom: 150.2, gap: 20.3 };
    await act(async () => root.render(<Probe />));
    expect(state.topChromeHeight).toBe(81);
    expect(state.bottomChromeHeight).toBe(151);
    expect(state.bottomSafeGap).toBe(21);
    expect(observers).toHaveLength(0);
  });

  test("实例切换重新观察，卸载释放全部 observer", async () => {
    await act(async () => root.render(<Probe />));
    const initial = [...observers];
    await act(async () => root.render(<Probe />));
    expect(observers).toHaveLength(3);
    await act(async () => root.render(<Probe instanceId="two" />));
    expect(initial.every((observer) => observer.disconnected)).toBe(true);
    expect(observers).toHaveLength(6);
    expect(
      observers.slice(3).every((observer) => observer.target?.isConnected),
    ).toBe(true);
    await act(async () => root.render(null));
    expect(observers.every((observer) => observer.disconnected)).toBe(true);
  });
});
