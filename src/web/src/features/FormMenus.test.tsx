import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MotionConfig } from "motion/react";
import i18n from "../i18n";
import { NewInstanceModal } from "./instances/NewInstanceModal";
import { CompactModal } from "./conversation/CompactModal";
import { SessionPopover } from "./conversation/SessionPopover";

let root: Root;
let container: HTMLDivElement;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
const preconnect = globalThis.fetch.preconnect;
function fakeFetch(
  handler: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch {
  return Object.assign(handler, { preconnect });
}
const edges = [
  { edgeId: "one", hostname: "first", homedir: "/first" },
  { edgeId: "two", hostname: "second", homedir: "/second" },
];
beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    fakeFetch(async (input) =>
      Response.json(
        String(input).includes("browse")
          ? { parent: "/first", entries: [], truncated: false }
          : { edges },
      ),
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  fetchSpy.mockRestore();
  await i18n.changeLanguage("zh-CN");
});
function button(label: string) {
  const result = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (element) =>
      element.textContent === label ||
      element.getAttribute("aria-label") === label,
  );
  expect(Boolean(result)).toBe(true);
  return result!;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
}
async function input(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
    element,
    value,
  );
  await act(async () =>
    element.dispatchEvent(new Event("input", { bubbles: true })),
  );
}
async function newInstance(onCreated: (id: string) => void = () => {}) {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <NewInstanceModal onClose={() => {}} onCreated={onCreated} />
      </MotionConfig>,
    ),
  );
}

describe("表单功能", () => {
  test("Edge 选择与工作目录字段保留关联和默认值", async () => {
    await newInstance();
    const dialog = document.querySelector("dialog")!;
    const select = dialog.querySelector("select")!;
    expect(select.value).toBe("one");
    expect(dialog.querySelector("input")!.value).toBe("/first/");
    select.value = "two";
    await act(async () =>
      select.dispatchEvent(new Event("change", { bubbles: true })),
    );
    expect(dialog.querySelector("input")!.value).toBe("/second/");
    expect(
      [...dialog.querySelectorAll("label")].every((label) =>
        Boolean(document.getElementById(label.htmlFor)),
      ),
    ).toBe(true);
    expect(
      dialog
        .querySelector(".modal-content")!
        .contains(dialog.querySelector("footer")),
    ).toBe(false);
  });
  test("触摸设备打开新建表单时保留标题焦点", async () => {
    const original = window.matchMedia.bind(window);
    const mediaSpy = spyOn(window, "matchMedia").mockImplementation((query) => {
      const result = original(query);
      if (query === "(pointer: coarse)") {
        Object.defineProperty(result, "matches", {
          configurable: true,
          value: true,
        });
      }
      return result;
    });
    try {
      await newInstance();
      const dialog = document.querySelector("dialog")!;
      expect(
        document.activeElement ===
          document.getElementById(dialog.getAttribute("aria-labelledby")!),
      ).toBe(true);
    } finally {
      mediaSpy.mockRestore();
    }
  });
  test("创建提交原始 Edge ID 与去除首尾空白的目录", async () => {
    const created: string[] = [];
    let payload: unknown;
    fetchSpy.mockImplementation(
      fakeFetch(async (_, options) => {
        if (options?.method === "POST") {
          payload = JSON.parse(String(options.body));
          return Response.json({ instanceId: "created" });
        }
        return Response.json({ edges });
      }),
    );
    await newInstance((id) => created.push(id));
    await input(document.querySelector("dialog input")!, " /project ");
    await click(button("创建"));
    expect(payload).toEqual({ cwd: "/project", edgeId: "one" });
    expect(created).toEqual(["created"]);
  });
  test("没有 Edge 时禁用创建并显示原因", async () => {
    fetchSpy.mockImplementation(
      fakeFetch(async () => Response.json({ edges: [] })),
    );
    await newInstance();
    expect(button("创建").disabled).toBe(true);
    expect(document.querySelector('[role="alert"]')!.textContent).toBe(
      "没有可用的 Edge 节点",
    );
  });
  test("创建失败恢复操作并显示服务端错误", async () => {
    fetchSpy.mockImplementation(
      fakeFetch(async (_, options) =>
        options?.method === "POST"
          ? Response.json({ error: "permission denied" }, { status: 403 })
          : Response.json({ edges }),
      ),
    );
    await newInstance();
    await click(button("创建"));
    expect(button("创建").disabled).toBe(false);
    expect(document.querySelector('[role="alert"]')!.textContent).toBe(
      "permission denied",
    );
  });
  test("目录补全继续支持点击选择与输入焦点", async () => {
    fetchSpy.mockImplementation(
      fakeFetch(async (url) =>
        String(url).includes("browse")
          ? Response.json({
              parent: "/first",
              entries: [{ name: "project" }],
              truncated: false,
            })
          : Response.json({ edges }),
      ),
    );
    await newInstance();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    await click(button("project"));
    const field = document.querySelector<HTMLInputElement>("dialog input")!;
    expect(field.value).toBe("/first/project/");
    expect(document.activeElement === field).toBe(true);
  });
  test("压缩确认保留自定义说明与空输入语义", async () => {
    const confirmed: (string | undefined)[] = [];
    await act(async () =>
      root.render(
        <MotionConfig reducedMotion="always">
          <CompactModal
            onClose={() => {}}
            onConfirm={(value) => confirmed.push(value)}
          />
        </MotionConfig>,
      ),
    );
    await input(document.querySelector("textarea")!, " keep database ");
    await click(button("开始压缩"));
    await input(document.querySelector("textarea")!, "  ");
    await click(button("开始压缩"));
    expect(confirmed).toEqual(["keep database", undefined]);
  });
});

describe("Session 菜单功能", () => {
  const session = {
    id: "current",
    path: "/current",
    cwd: "/project",
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    messageCount: 2,
    firstMessage: "hello",
    name: "Current",
    isCurrent: true,
  };
  async function sessions({
    empty = false,
    onSwitch = (_: string) => {},
    onNew = () => {},
    onFilter = (_: string) => {},
    onLoad = (_: number, __?: string) => {},
  } = {}) {
    await act(async () =>
      root.render(
        <MotionConfig reducedMotion="always">
          <SessionPopover
            sessions={
              empty
                ? []
                : [
                    session,
                    {
                      ...session,
                      id: "next",
                      path: "/next",
                      name: "Next",
                      isCurrent: false,
                    },
                  ]
            }
            loading={false}
            hasMore={!empty}
            total={2}
            disabled={false}
            onOpen={() => {}}
            onNewSession={onNew}
            onSwitchSession={onSwitch}
            onFilterChange={onFilter}
            onLoadMore={onLoad}
          />
        </MotionConfig>,
      ),
    );
    await click(button("Sessions"));
  }
  test("Session 浮层高度同时受内容上限与可用视口限制", async () => {
    await sessions();
    const panel = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(Number.parseFloat(panel.style.maxHeight)).toBe(420);
    const original = window.innerHeight;
    try {
      await act(async () => root.render(null));
      window.innerHeight = 240;
      await sessions();
      const compactPanel =
        document.querySelector<HTMLElement>('[role="dialog"]')!;
      expect(Number.parseFloat(compactPanel.style.maxHeight)).toBeLessThan(240);
      expect(Number.parseFloat(compactPanel.style.maxHeight)).toBeGreaterThan(
        0,
      );
    } finally {
      window.innerHeight = original;
    }
  });
  test("当前 Session 保持选中，切换提交原始路径", async () => {
    const switched: string[] = [];
    await sessions({ onSwitch: (path) => switched.push(path) });
    const panel = document.querySelector('[role="dialog"]')!;
    const current = panel.querySelector<HTMLButtonElement>(
      '[aria-current="true"]',
    )!;
    expect(current.disabled).toBe(true);
    const next = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(
      (element) => element.textContent?.startsWith("Next"),
    )!;
    await click(next);
    expect(switched).toEqual(["/next"]);
    expect(
      document.querySelector('[role="dialog"]:not([inert])') === null,
    ).toBe(true);
  });
  test("新建操作关闭菜单并调用原有回调", async () => {
    let created = 0;
    await sessions({ onNew: () => created++ });
    await click(button("新建"));
    expect(created).toBe(1);
    expect(
      document.querySelector('[role="dialog"]:not([inert])') === null,
    ).toBe(true);
  });
  test("空列表与搜索保留各自状态和服务端筛选", async () => {
    const filters: string[] = [];
    await sessions({ empty: true, onFilter: (filter) => filters.push(filter) });
    expect(document.querySelector('[role="status"]')!.textContent).toBe(
      "暂无历史 Session",
    );
    await input(document.querySelector('[aria-label="筛选…"]')!, "query");
    expect(document.querySelector('[role="status"]')!.textContent).toBe(
      "无匹配的 Session",
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
    expect(filters).toEqual(["query"]);
  });
  test("列表触底继续使用原始条目数量分页", async () => {
    const offsets: number[] = [];
    await sessions({ onLoad: (offset) => offsets.push(offset) });
    await act(async () =>
      document
        .querySelector(".ui-menu-scroll")!
        .dispatchEvent(new Event("scroll", { bubbles: true })),
    );
    expect(offsets).toEqual([2]);
  });
});
