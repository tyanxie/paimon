import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import i18n from "../../i18n";
import { InstanceHeader } from "./InstanceHeader";
import { MobileNavBar } from "./MobileNavBar";

let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  await i18n.changeLanguage("zh-CN");
});
async function click(element: Element) {
  await act(async () =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
}

describe("实例顶部信息", () => {
  test("标题、路径与分支保留归属，复制使用完整原始值", async () => {
    await act(async () =>
      root.render(
        <InstanceHeader
          title="project"
          cwd="/home/user/Projects/project"
          homedir="/home/user"
          gitBranch="feature/work"
          actions={<button>Sessions</button>}
        />,
      ),
    );
    expect(container.textContent).toContain("project");
    expect(container.textContent).toContain("~/Projects/project");
    expect(container.textContent).toContain("feature/work");
    expect(container.textContent).toContain("Sessions");
    await click(
      container.querySelector('[title="/home/user/Projects/project"]')!,
    );
    expect(await navigator.clipboard.readText()).toBe(
      "/home/user/Projects/project",
    );
    await click(container.querySelector('[title="feature/work"]')!);
    expect(await navigator.clipboard.readText()).toBe("feature/work");
  });

  test("home 前缀只匹配完整目录，更新实例时同步路径与分支", async () => {
    await act(async () =>
      root.render(
        <InstanceHeader
          title="project"
          cwd="/home/user2/project"
          homedir="/home/user"
          gitBranch="main"
        />,
      ),
    );
    expect(container.textContent).toContain("/home/user2/project");
    await act(async () =>
      root.render(
        <InstanceHeader
          title="next"
          cwd="/home/user"
          homedir="/home/user"
          gitBranch={null}
        />,
      ),
    );
    expect(container.textContent).toContain("next");
    expect(container.querySelector('[title="/home/user"]')!.textContent).toBe(
      "~",
    );
    expect(container.querySelector('[title="main"]')).toBeNull();
  });

  test("缺少元信息时保留标题与操作区域", async () => {
    await act(async () =>
      root.render(
        <InstanceHeader title="project" actions={<button>Sessions</button>} />,
      ),
    );
    expect(container.textContent).toBe("projectSessions");
    expect(container.querySelectorAll(".header-material")).toHaveLength(0);
    expect(container.firstElementChild?.children).toHaveLength(2);
  });

  test("标题与操作共同占用可用宽度，材质由外层顶部栏提供", async () => {
    await act(async () =>
      root.render(
        <InstanceHeader
          title="project"
          cwd="/Projects/project"
          gitBranch="feature/work"
          actions={<button>Sessions</button>}
        />,
      ),
    );
    const header = container.firstElementChild!;
    const info = header.firstElementChild!;
    const actions = header.lastElementChild!;
    expect(header.classList.contains("w-full")).toBe(true);
    expect(info.classList.contains("flex-1")).toBe(true);
    expect(info.className).not.toContain("max-w-");
    expect(info.textContent).toContain("project");
    expect(actions.textContent).toBe("Sessions");
    expect(actions.classList.contains("shrink-0")).toBe(true);
    expect(header.querySelector(".header-material")).toBeNull();
  });

  test("复制失败时保持当前信息", async () => {
    const copy = spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("Clipboard unavailable"),
    );
    try {
      await act(async () =>
        root.render(<InstanceHeader title="project" cwd="/project" />),
      );
      await click(container.querySelector('[title="/project"]')!);
      expect(container.textContent).toContain("/project");
      expect(container.querySelector(".lucide-check")).toBeNull();
    } finally {
      copy.mockRestore();
    }
  });

  test("移动端返回入口使用国际化标签并返回实例列表", async () => {
    await i18n.changeLanguage("en");
    let path = "";
    function Observer() {
      path = useLocation().pathname;
      return null;
    }
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={["/instance/one"]}>
          <Observer />
          <MobileNavBar>
            <InstanceHeader title="project" />
          </MobileNavBar>
        </MemoryRouter>,
      ),
    );
    await click(container.querySelector('[aria-label="Back to instances"]')!);
    expect(path).toBe("/");
  });
});
