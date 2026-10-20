import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MotionConfig } from "motion/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import type { InstanceInfo } from "../../../protocol/types";
import i18n from "../i18n";
import { useWebSocket } from "../stores/useWebSocket";
import { Sidebar } from "./Sidebar";

const base: InstanceInfo = {
  id: "one",
  edgeId: "edge-b",
  hostname: "host",
  cwd: "/home/user/first",
  homedir: "/home/user",
  pid: 1,
  model: { provider: "provider", id: "model" },
  status: "idle",
  connectedAt: 0,
  lastHeartbeat: 0,
};
const instances = [
  base,
  {
    ...base,
    id: "two",
    edgeId: "edge-a",
    cwd: "/second",
    status: "streaming" as const,
  },
  { ...base, id: "three", cwd: "/third", status: "compacting" as const },
];
let root: Root;
let container: HTMLDivElement;
let selected: string[];
let shutdown: string[];
let created: number;
let pathname: string;
let connectionState: ReturnType<
  typeof useWebSocket.getState
>["connectionState"];

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  selected = [];
  shutdown = [];
  created = 0;
  connectionState = useWebSocket.getState().connectionState;
  useWebSocket.setState({ connectionState: "connected" });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useWebSocket.setState({ connectionState });
  await i18n.changeLanguage("zh-CN");
});
function Observer() {
  pathname = useLocation().pathname;
  return null;
}
async function render(list = instances, path = "/instance/one") {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <MemoryRouter initialEntries={[path]}>
          <Observer />
          <Sidebar
            instances={list}
            selectedId={path === "/instance/one" ? "one" : null}
            onSelect={(id) => selected.push(id)}
            onShutdown={(id) => shutdown.push(id)}
            onNewInstance={() => {
              created += 1;
            }}
          />
        </MemoryRouter>
      </MotionConfig>,
    ),
  );
}
async function click(element: Element) {
  await act(async () =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
}
function select(id: string) {
  return container.querySelector(
    `[data-instance-id="${id}"] [data-instance-select]`,
  )!;
}

function touch(element: Element, type: string) {
  return element.dispatchEvent(
    new TouchEvent(type, {
      bubbles: true,
      touches: [{ clientX: 100, clientY: 200 } as Touch],
    }),
  );
}

describe("整体玻璃侧栏", () => {
  test("全局入口与实例列表共用面板，Edge 保持分组和顺序", async () => {
    await render();
    expect(container.querySelector('nav[aria-label="主导航"]')).not.toBeNull();
    expect(
      container.querySelector('section[aria-label="实例"]'),
    ).not.toBeNull();
    expect(
      [...container.querySelectorAll("[data-edge-id]")].map((element) =>
        element.getAttribute("data-edge-id"),
      ),
    ).toEqual(["edge-a", "edge-b"]);
    expect(
      [
        ...container
          .querySelector('[data-edge-id="edge-b"]')!
          .querySelectorAll("[data-instance-id]"),
      ].map((element) => element.getAttribute("data-instance-id")),
    ).toEqual(["one", "three"]);
    expect(container.textContent).toContain("2 台机器 · 3 个实例");
  });

  test("页眉入口、实例标题和连接信息位于同一个玻璃面板内", async () => {
    await render();
    const panel = container.querySelector("aside.glass-panel")!;
    const header = panel.querySelector(".sidebar-header")!;
    const navigation = header.querySelector('nav[aria-label="主导航"]')!;
    const list = panel.querySelector(".instance-list")!;
    expect(container.querySelectorAll(".glass-panel")).toHaveLength(1);
    expect(header.querySelector('img[alt="Paimon"]')).not.toBeNull();
    expect(navigation.querySelector('[aria-label="首页"]')).not.toBeNull();
    expect(navigation.querySelector('[aria-label="设置"]')).not.toBeNull();
    expect(navigation.classList.contains("flex")).toBe(true);
    expect(panel.classList.contains("flex-col")).toBe(true);
    expect(list.querySelector("h1")!.textContent).toBe("实例");
    expect(list.querySelector('[aria-label="新建实例"]')).not.toBeNull();
    const connection = list.querySelector('[aria-label="连接状态"]')!;
    expect(connection.parentElement!.textContent).toContain(
      "2 台机器 · 3 个实例",
    );
  });

  test("实例列表独立滚动，页眉与新建入口保持在滚动容器外", async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      ...base,
      id: `instance-${index}`,
      cwd: `/Projects/project-${index}`,
    }));
    await render(many);
    const panel = container.querySelector("aside.glass-panel")!;
    const list = panel.querySelector(".instance-list")!;
    const scrollArea = list.lastElementChild!;
    expect(panel.classList.contains("overflow-hidden")).toBe(true);
    expect(list.classList.contains("min-h-0")).toBe(true);
    expect(scrollArea.classList.contains("overflow-y-auto")).toBe(true);
    expect(scrollArea.querySelectorAll("[data-instance-id]")).toHaveLength(60);
    expect(scrollArea.contains(panel.querySelector(".sidebar-header"))).toBe(
      false,
    );
    expect(
      scrollArea.contains(panel.querySelector('[aria-label="新建实例"]')),
    ).toBe(false);
    expect(
      scrollArea.contains(panel.querySelector('[aria-label="连接状态"]')),
    ).toBe(false);
  });

  test("选择实例保留原始 ID，选中状态使用局部背景入口", async () => {
    await render();
    expect(select("one").getAttribute("aria-current")).toBe("page");
    expect(select("two").getAttribute("aria-current")).toBeNull();
    await click(select("two"));
    expect(selected).toEqual(["two"]);
    expect(shutdown).toEqual([]);
  });

  test("首页、设置和新建实例入口保持可用", async () => {
    await render();
    await click(container.querySelector('[aria-label="设置"]')!);
    expect(pathname).toBe("/settings");
    expect(
      container
        .querySelector('[aria-label="设置"]')!
        .getAttribute("aria-current"),
    ).toBe("page");
    await click(container.querySelector('[aria-label="首页"]')!);
    expect(pathname).toBe("/");
    await click(container.querySelector('[aria-label="新建实例"]')!);
    expect(created).toBe(1);
  });

  test("复制 Edge ID 与连接信息保持可见", async () => {
    await render();
    await click(container.querySelector('[aria-label="复制 Edge：edge-a"]')!);
    expect(await navigator.clipboard.readText()).toBe("edge-a");
    expect(
      container.querySelector('[aria-label="连接状态"] [title="在线"]'),
    ).not.toBeNull();
    await act(async () =>
      useWebSocket.setState({ connectionState: "disconnected" }),
    );
    expect(
      container.querySelector('[aria-label="连接状态"] [title="离线"]'),
    ).not.toBeNull();
  });

  test("实例操作按钮提供退出入口，保持选择操作独立", async () => {
    await render();
    await click(container.querySelector('[aria-label="first 的实例操作"]')!);
    const exit = [...document.querySelectorAll("button")].find(
      (element) => element.textContent === "退出实例",
    )!;
    await click(exit);
    expect(shutdown).toEqual(["one"]);
    expect(selected).toEqual([]);
    expect(document.querySelector(".glass-popover:not([inert])") === null).toBe(
      true,
    );
  });

  test("右键保留实例菜单与 Esc 关闭能力", async () => {
    await render();
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
    });
    await act(async () => select("two").dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector(".glass-popover")).not.toBeNull();
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.querySelector(".glass-popover:not([inert])") === null).toBe(
      true,
    );
  });

  test("长按打开实例菜单并限制随后的选择点击", async () => {
    await render();
    await act(async () => {
      touch(select("one"), "touchstart");
      await new Promise((resolve) => setTimeout(resolve, 520));
    });
    expect(document.querySelector(".glass-popover")).not.toBeNull();
    await act(async () => touch(select("one"), "touchend"));
    await click(select("one"));
    expect(selected).toEqual([]);
  });

  test("移动手指取消长按，继续保留列表滚动", async () => {
    await render();
    await act(async () => {
      touch(select("one"), "touchstart");
      touch(select("one"), "touchmove");
      await new Promise((resolve) => setTimeout(resolve, 520));
    });
    expect(document.querySelector(".glass-popover") === null).toBe(true);
    await click(select("one"));
    expect(selected).toEqual(["one"]);
  });

  test("运行、压缩和空闲状态保留明确文字与上下文读数", async () => {
    await render([
      {
        ...base,
        contextUsage: { tokens: 950, contextWindow: 1000, percent: 95 },
      },
      ...instances.slice(1),
    ]);
    expect(select("one").textContent).toContain("空闲");
    expect(select("two").textContent).toContain("生成中");
    expect(select("three").textContent).toContain("压缩中");
    expect(
      select("one")
        .querySelector('[role="progressbar"]')!
        .getAttribute("aria-valuenow"),
    ).toBe("95");
  });

  test("空列表提供新建入口与英文说明", async () => {
    await i18n.changeLanguage("en");
    await render([], "/");
    expect(container.textContent).toContain("No pi instances connected");
    expect(
      container.querySelector('nav[aria-label="Main navigation"]'),
    ).not.toBeNull();
    await click(container.querySelector('[aria-label="New instance"]')!);
    expect(created).toBe(1);
  });
});
