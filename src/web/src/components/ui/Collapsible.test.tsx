import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  LazyMotion,
  MotionConfig,
  domAnimation,
  visualElementStore,
} from "motion/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Collapsible } from "./Collapsible";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(expanded: boolean, content = "content", settle = true) {
  await act(async () => {
    root.render(
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="always">
          <Collapsible id="collapse-test" expanded={expanded}>
            <input aria-label="input" defaultValue="draft" />
            <p>{content}</p>
          </Collapsible>
        </MotionConfig>
      </LazyMotion>,
    );
  });
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
  });
  if (settle) {
    // MotionConfig 的 reduced motion 不会跳过 opacity 动画，等待 transitionEnd
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    });
  }
}

function panel() {
  return container.querySelector<HTMLDivElement>("#collapse-test")!;
}

function collapsedHeight() {
  const variant = visualElementStore.get(panel())?.getProps()
    .variants?.collapsed;
  const target =
    typeof variant === "function" ? variant(undefined, {}, {}) : variant;
  if (!target || typeof target === "string")
    throw new Error("Missing collapsed target");
  return target.height;
}

function measureHeight(height: number) {
  // happy-dom 没有真实布局，提供点击收起时的实际高度
  panel().getBoundingClientRect = () => new DOMRect(0, 0, 300, height);
}

describe("Collapsible", () => {
  test("初始收起不播放入场动画，展开收起保留内容身份与可访问状态", async () => {
    await render(false);
    const element = panel();
    const input = element.querySelector("input")!;
    input.value = "edited";
    expect(element.style.height).toBe("0px");
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.hasAttribute("inert")).toBe(true);

    await render(true);
    expect(panel()).toBe(element);
    expect(element.style.height).toBe("auto");
    expect(element.style.visibility).toBe("visible");
    expect(element.getAttribute("aria-hidden")).toBe("false");
    expect(element.hasAttribute("inert")).toBe(false);

    measureHeight(222);
    await render(false);
    expect(element.style.height).toBe("0px");
    expect(element.style.visibility).toBe("hidden");
    expect(element.querySelector("input")).toBe(input);
    expect(input.value).toBe("edited");
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.hasAttribute("inert")).toBe(true);
  });

  test.each([0, 137.5, 222])(
    "收起从当前数字高度 %p 开始，避免 auto 到 0 的临时布局测量",
    async (height) => {
      await render(true);
      measureHeight(height);
      await render(false);
      expect(collapsedHeight()).toEqual([height, 0]);
    },
  );

  test("展开内容增长仍使用 auto，收起采集最新高度", async () => {
    await render(true);
    measureHeight(222);
    await render(true, "longer content");
    expect(panel().style.height).toBe("auto");
    measureHeight(410);
    await render(false, "longer content");
    expect(collapsedHeight()).toEqual([410, 0]);
  });

  test("同一次收起期间内容更新不重新采集起点或重启动画", async () => {
    await render(true);
    measureHeight(222);
    await render(false);
    measureHeight(50);
    await render(false, "updated while collapsed");
    expect(collapsedHeight()).toEqual([222, 0]);
  });

  test("连续切换时每次收起采用当前高度而不是上一次展开高度", async () => {
    await render(true);
    measureHeight(410);
    await render(false, "content", false);
    expect(collapsedHeight()).toEqual([410, 0]);
    await render(true, "content", false);
    // 模拟再次收起时展开动画尚未到达完整高度
    measureHeight(137.5);
    await render(false, "content", false);
    expect(collapsedHeight()).toEqual([137.5, 0]);
    await render(true);
    expect(panel().style.height).toBe("auto");
    expect(panel().style.visibility).toBe("visible");
  });
});
