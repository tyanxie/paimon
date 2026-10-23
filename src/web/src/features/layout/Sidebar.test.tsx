import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import { MotionConfig } from "motion/react";
import { Sidebar } from "./Sidebar";
import { useSidebar } from "../../stores/useSidebar";
import { useWebSocket } from "../../stores/useWebSocket";
import i18n from "../../i18n";
import type { InstanceInfo } from "@protocol/types";

const instances: InstanceInfo[] = ["idle", "streaming", "compacting"].map(
  (status, index) => ({
    id: `instance-${index}`,
    edgeId: index === 2 ? "edge-b" : "edge-a",
    hostname: "host",
    cwd: "/projects/paimon",
    homedir: "/home",
    pid: index + 1,
    status: status as InstanceInfo["status"],
    model: { provider: "provider", id: "model", name: "Model" },
    contextUsage: { tokens: 100, contextWindow: 1000, percent: 10 },
    connectedAt: 0,
    lastHeartbeat: 0,
  }),
);
let root: Root;
let container: HTMLDivElement;
let selected: string[];
let shutdown: string[];
let created: number;

function Location() {
  return <output>{useLocation().pathname}</output>;
}
async function render(items = instances) {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <MemoryRouter initialEntries={["/instance/instance-0"]}>
          <Sidebar
            instances={items}
            selectedId="instance-0"
            onSelect={(id) => selected.push(id)}
            onShutdown={(id) => shutdown.push(id)}
            onNewInstance={() => created++}
          />
          <Location />
        </MemoryRouter>
      </MotionConfig>,
    ),
  );
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
}
function button(label: string) {
  return document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  )!;
}

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  useSidebar.setState({ collapsedEdges: {} });
  useWebSocket.setState({ connectionState: "connected" });
  selected = [];
  shutdown = [];
  created = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useSidebar.setState({ collapsedEdges: {} });
});

describe("侧栏导航与分组", () => {
  test("顶部提供首页、设置与新建入口，连接状态更新", async () => {
    await render();
    expect(container.textContent).toContain("Hub 已连接");
    await click(button("新建实例"));
    expect(created).toBe(1);
    await click(button("设置"));
    expect(container.querySelector("output")!.textContent).toBe("/settings");
    await click(button("首页"));
    expect(container.querySelector("output")!.textContent).toBe("/");
    await act(async () =>
      useWebSocket.setState({ connectionState: "disconnected" }),
    );
    expect(container.textContent).toContain("Hub 连接中断");
    await act(async () =>
      useWebSocket.setState({ connectionState: "connecting" }),
    );
    expect(container.textContent).toContain("Hub 正在连接");
  });

  test("机器展开选择跨重建与持久化恢复，实例更新保留选择", async () => {
    await render();
    const toggle = button("展开或折叠机器 edge-a");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toContain("edge-a");
    expect(toggle.textContent).toContain("(2)");

    await click(toggle);
    expect(
      container
        .querySelector('[data-edge-id="edge-a"] ul')!
        .hasAttribute("hidden"),
    ).toBe(true);
    expect(
      JSON.parse(localStorage.getItem("paimon:sidebar")!).state.collapsedEdges[
        "edge-a"
      ],
    ).toBe(true);
    await act(async () => root.render(null));
    await render([...instances].reverse());
    expect(button("展开或折叠机器 edge-a").getAttribute("aria-expanded")).toBe(
      "false",
    );
    const persisted = localStorage.getItem("paimon:sidebar")!;
    await act(async () => useSidebar.setState({ collapsedEdges: {} }));
    localStorage.setItem("paimon:sidebar", persisted);
    await act(async () => useSidebar.persist.rehydrate());
    expect(useSidebar.getState().collapsedEdges["edge-a"]).toBe(true);
    await click(button("展开或折叠机器 edge-a"));
    expect(button("展开或折叠机器 edge-a").getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  test("实例保留统一状态、模型、用量和选中状态，菜单独立操作", async () => {
    await render();
    const rows = [
      ...container.querySelectorAll<HTMLButtonElement>(
        "[data-instance-select]",
      ),
    ];
    expect(rows).toHaveLength(3);
    expect(rows[0]!.getAttribute("aria-current")).toBe("page");
    expect(rows[0]!.querySelector(".instance-status")!.className).toContain(
      "toast-icon-success",
    );
    expect(rows[1]!.querySelector(".instance-status")!.className).toContain(
      "color-accent",
    );
    expect(rows[2]!.querySelector(".instance-status")!.className).toContain(
      "toast-icon-warning",
    );
    expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(3);
    expect(rows[0]!.textContent).toContain("Model");
    await click(rows[1]!);
    expect(selected).toEqual(["instance-1"]);
    await click(
      container.querySelector<HTMLButtonElement>(
        '[data-instance-id="instance-0"] .instance-actions',
      )!,
    );
    await click(
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(
        (item) => item.textContent === "退出实例",
      )!,
    );
    expect(shutdown).toEqual(["instance-0"]);
    expect(selected).toEqual(["instance-1"]);
  });

  test("机器菜单复制原始 Edge identifier，关闭后恢复入口焦点", async () => {
    await render();
    const copy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      const trigger = button("edge-a 的机器操作");
      await click(trigger);
      await click(
        [...document.querySelectorAll<HTMLButtonElement>("button")].find(
          (item) => item.textContent === "复制名称",
        )!,
      );
      expect(copy).toHaveBeenCalledWith("edge-a");
      expect(document.activeElement).toBe(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    } finally {
      copy.mockRestore();
    }
  });

  test("空列表保留新建入口与说明，英文提供操作标签", async () => {
    await render([]);
    expect(container.textContent).toContain("暂无 pi 实例连接");
    expect(button("新建实例")).not.toBeNull();
    await act(async () => i18n.changeLanguage("en"));
    await render();
    expect(button("New instance")).not.toBeNull();
    expect(button("Expand or collapse machine edge-a")).not.toBeNull();
    expect(container.textContent).toContain("Hub connected");
  });
});
