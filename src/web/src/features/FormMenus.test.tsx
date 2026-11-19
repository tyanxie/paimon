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
          ? { parent: "/first/", entries: [], truncated: false }
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
async function newInstance(
  onCreated: (id: string) => void = () => {},
  onClose: () => void = () => {},
) {
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <NewInstanceModal onClose={onClose} onCreated={onCreated} />
      </MotionConfig>,
    ),
  );
}

async function waitForBrowse() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 320)));
}

function directoryList() {
  return document.querySelector<HTMLDivElement>(".instance-directory-list")!;
}

function mockDirectories(names: string[] = ["project", "second"]) {
  fetchSpy.mockImplementation(
    fakeFetch(async (url) => {
      if (!String(url).includes("browse")) return Response.json({ edges });
      const path = new URL(String(url), "http://localhost").searchParams.get(
        "path",
      )!;
      const parent = path.endsWith("/")
        ? path
        : path.slice(0, path.lastIndexOf("/") + 1);
      return Response.json({
        parent,
        entries: names.map((name) => ({ name })),
        truncated: false,
      });
    }),
  );
}

async function key(element: HTMLElement, key: string) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => element.dispatchEvent(event));
  return event;
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
      if (query === "(pointer: coarse)" || query === "(max-width: 767px)") {
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
        dialog.querySelector(".modal-panel")!.getAttribute("data-sheet"),
      ).toBe("true");
      await waitForBrowse();
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
  test("目录选择更新路径并将焦点留在持续浏览区", async () => {
    fetchSpy.mockImplementation(
      fakeFetch(async (url) =>
        String(url).includes("browse")
          ? Response.json({
              parent: "/first/",
              entries: [{ name: "project" }],
              truncated: false,
            })
          : Response.json({ edges }),
      ),
    );
    await newInstance();
    await waitForBrowse();
    const list = directoryList();
    await click(button("project"));
    const field = document.querySelector<HTMLInputElement>("dialog input")!;
    expect(field.value).toBe("/first/project/");
    expect(directoryList()).toBe(list);
    expect(document.activeElement).toBe(list);
  });
  test("失焦、重新聚焦和滚动不会隐藏已加载的目录", async () => {
    mockDirectories();
    await newInstance();
    await waitForBrowse();
    const list = directoryList();
    list.scrollTop = 120;
    await act(async () => {
      button("取消").focus();
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 180)));
    expect(directoryList()).toBe(list);
    expect(list.contains(button("project"))).toBe(true);
    expect(list.scrollTop).toBe(120);
    await act(async () =>
      document.querySelector<HTMLInputElement>("dialog input")!.focus(),
    );
    expect(directoryList()).toBe(list);
    expect(list.scrollTop).toBe(120);
  });
  test("上一级按输入路径计算，整行保留可访问名称，根目录不显示", async () => {
    await newInstance();
    const field = document.querySelector<HTMLInputElement>("dialog input")!;
    for (const path of ["/home/pro", "/home/pro/", " /home/pro/// "]) {
      await input(field, path);
      const parent = button("上一级");
      expect(parent.textContent).toBe("..");
      expect(parent.title).toBe("上一级");
      expect(directoryList().firstElementChild).toBe(parent);
      await click(parent);
      expect(field.value).toBe("/home/");
      expect(document.activeElement).toBe(directoryList());
    }
    await click(button("上一级"));
    expect(field.value).toBe("/");
    expect(document.querySelector('[aria-label="上一级"]')).toBeNull();
  });
  test("目录键盘导航包括上一级，Tab 不拦截也不补全路径", async () => {
    mockDirectories();
    await newInstance();
    await waitForBrowse();
    const field = document.querySelector<HTMLInputElement>("dialog input")!;
    await key(field, "ArrowDown");
    expect(document.activeElement).toBe(button("上一级"));
    await key(button("上一级"), "ArrowDown");
    expect(document.activeElement).toBe(button("project"));
    await key(button("project"), "End");
    expect(document.activeElement).toBe(button("second"));
    expect(
      [
        ...directoryList().querySelectorAll<HTMLButtonElement>(".ui-menu-item"),
      ].filter((item) => item.tabIndex === 0),
    ).toHaveLength(1);
    await key(button("second"), "Home");
    expect(document.activeElement).toBe(button("上一级"));
    await act(async () => field.focus());
    expect((await key(field, "Tab")).defaultPrevented).toBe(false);
    expect(field.value).toBe("/first/");
  });
  test("键盘滚动使用显式正文容器，并优先滚动溢出的目录列表", async () => {
    mockDirectories();
    await newInstance();
    await waitForBrowse();
    const list = directoryList();
    const form = document.querySelector<HTMLDivElement>(
      ".instance-create-form",
    )!;
    const field = document.querySelector<HTMLInputElement>("dialog input")!;
    const parent = button("上一级");
    const project = button("project");
    form.classList.remove("instance-create-form");
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 100 },
      clientHeight: { configurable: true, value: 100 },
    });
    const formRect = spyOn(form, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 200, 100),
    );
    const listRect = spyOn(list, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 200, 100),
    );
    const parentRect = spyOn(parent, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 200, 32),
    );
    const projectRect = spyOn(project, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 160, 200, 32),
    );
    try {
      await key(field, "ArrowDown");
      await key(parent, "ArrowDown");
      expect(document.activeElement).toBe(project);
      expect(form.scrollTop).toBe(92);
      expect(list.scrollTop).toBe(0);

      form.scrollTop = 0;
      Object.defineProperty(list, "scrollHeight", {
        configurable: true,
        value: 400,
      });
      await key(project, "Home");
      await key(parent, "ArrowDown");
      expect(list.scrollTop).toBe(92);
      expect(form.scrollTop).toBe(0);

      parentRect.mockReturnValue(new DOMRect(0, -40, 200, 32));
      await key(project, "Home");
      expect(list.scrollTop).toBe(52);
      expect(form.scrollTop).toBe(0);
    } finally {
      formRect.mockRestore();
      listRect.mockRestore();
      parentRect.mockRestore();
      projectRect.mockRestore();
    }
  });
  test("路径变化立即移除旧目录，输入无效路径时保持浏览区和说明", async () => {
    mockDirectories();
    await newInstance();
    await waitForBrowse();
    const list = directoryList();
    const field = document.querySelector<HTMLInputElement>("dialog input")!;
    await input(field, "/other/");
    expect(list.textContent).not.toContain("project");
    expect(list.getAttribute("aria-busy")).toBe("true");
    await input(field, "relative");
    expect(directoryList()).toBe(list);
    expect(list.textContent).toContain("输入绝对路径以浏览目录");
    expect(list.getAttribute("aria-busy")).toBe("false");
    expect(list.querySelector(".ui-menu-item")).toBeNull();
  });
  test("防抖期间取消旧请求，晚到的旧结果不能覆盖当前路径", async () => {
    let oldSignal: AbortSignal | undefined;
    let resolveOld: ((response: Response) => void) | undefined;
    fetchSpy.mockImplementation(
      fakeFetch((url, options) => {
        if (!String(url).includes("browse"))
          return Promise.resolve(Response.json({ edges }));
        const path = new URL(String(url), "http://localhost").searchParams.get(
          "path",
        );
        if (path === "/first/") {
          oldSignal = options?.signal ?? undefined;
          return new Promise<Response>((resolve) => {
            resolveOld = resolve;
          });
        }
        return Promise.resolve(
          Response.json({
            parent: path,
            entries: [{ name: "current" }],
            truncated: false,
          }),
        );
      }),
    );
    await newInstance();
    await waitForBrowse();
    expect(resolveOld).toBeDefined();
    await input(document.querySelector("dialog input")!, "/other/");
    expect(oldSignal?.aborted).toBe(true);
    await act(async () =>
      resolveOld?.(
        Response.json({
          parent: "/first/",
          entries: [{ name: "outdated" }],
          truncated: false,
        }),
      ),
    );
    expect(directoryList().textContent).not.toContain("outdated");
    expect(directoryList().getAttribute("aria-busy")).toBe("true");
    await waitForBrowse();
    expect(directoryList().contains(button("current"))).toBe(true);
    expect(directoryList().textContent).not.toContain("outdated");
  });
  test("空浏览结果和没有匹配项保留浏览区并提供不同说明", async () => {
    await newInstance();
    await waitForBrowse();
    const list = directoryList();
    expect(list.querySelector('[role="status"]')!.textContent).toBe(
      "没有可显示的子目录，可在当前工作目录创建实例",
    );
    expect(list.contains(button("上一级"))).toBe(true);
    await input(document.querySelector("dialog input")!, "/first/missing");
    await waitForBrowse();
    expect(directoryList()).toBe(list);
    expect(list.textContent).toContain("没有匹配的目录");
    expect(button("创建").disabled).toBe(false);
  });
  test("英文空浏览结果不声称实际不存在子目录", async () => {
    await i18n.changeLanguage("en");
    await newInstance();
    await waitForBrowse();
    expect(directoryList().querySelector('[role="status"]')!.textContent).toBe(
      "No subdirectories to display. You can create an instance in the current working directory.",
    );
  });
  test("目录读取失败显示原因，允许重试和返回上一级", async () => {
    let browseCount = 0;
    fetchSpy.mockImplementation(
      fakeFetch(async (url) => {
        if (!String(url).includes("browse")) return Response.json({ edges });
        browseCount++;
        return browseCount === 1
          ? Response.json({ error: "permission denied" }, { status: 403 })
          : Response.json({
              parent: "/first/",
              entries: [{ name: "recovered" }],
              truncated: false,
            });
      }),
    );
    await newInstance();
    await waitForBrowse();
    const list = directoryList();
    expect(list.querySelector('[role="alert"]')!.textContent).toContain(
      "permission denied",
    );
    expect(button("上一级").disabled).toBe(false);
    await click(button("重试"));
    await waitForBrowse();
    expect(directoryList()).toBe(list);
    expect(list.querySelector('[role="alert"]')).toBeNull();
    expect(list.contains(button("recovered"))).toBe(true);
    expect(browseCount).toBe(2);
  });
  test("Edge 名称和 ID 相同时不重复展示", async () => {
    fetchSpy.mockImplementation(
      fakeFetch(async () =>
        Response.json({
          edges: [{ edgeId: "same", hostname: "same", homedir: "/home" }],
        }),
      ),
    );
    await newInstance();
    const note = document.querySelector<HTMLElement>(".ui-form-note")!;
    expect(note.textContent).toBe("same");
    expect(note.title).toBe("same");
  });
  test("创建中禁止所有关闭入口，失败后恢复操作", async () => {
    let resolveCreation: ((response: Response) => void) | undefined;
    let closed = 0;
    fetchSpy.mockImplementation(
      fakeFetch((_, options) =>
        options?.method === "POST"
          ? new Promise<Response>((resolve) => {
              resolveCreation = resolve;
            })
          : Promise.resolve(Response.json({ edges })),
      ),
    );
    await newInstance(
      () => {},
      () => closed++,
    );
    await click(button("创建"));
    expect(resolveCreation).toBeDefined();
    expect(button("取消").disabled).toBe(true);
    expect(button("关闭").disabled).toBe(true);
    expect(button("上一级").disabled).toBe(true);
    const dialog = document.querySelector("dialog")!;
    const cancel = new Event("cancel", { cancelable: true });
    await act(async () => dialog.dispatchEvent(cancel));
    await click(dialog.querySelector<HTMLElement>(".modal-positioner")!);
    expect(cancel.defaultPrevented).toBe(true);
    expect(closed).toBe(0);
    await act(async () =>
      resolveCreation?.(
        Response.json({ error: "spawn failed" }, { status: 500 }),
      ),
    );
    expect(button("取消").disabled).toBe(false);
    expect(button("关闭").disabled).toBe(false);
    expect(button("上一级").disabled).toBe(false);
    expect(dialog.querySelector('[role="alert"]')!.textContent).toBe(
      "spawn failed",
    );
  });
  test("卸载浏览区会取消正在进行的目录请求", async () => {
    let signal: AbortSignal | undefined;
    let finish: ((response: Response) => void) | undefined;
    fetchSpy.mockImplementation(
      fakeFetch((url, options) => {
        if (!String(url).includes("browse"))
          return Promise.resolve(Response.json({ edges }));
        signal = options?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }),
    );
    await newInstance();
    await waitForBrowse();
    expect(signal?.aborted).toBe(false);
    await act(async () => root.render(null));
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      finish?.(
        Response.json({ parent: "/first/", entries: [], truncated: false }),
      ),
    );
    expect(document.querySelector("dialog")).toBeNull();
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
