import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { AdaptiveToolbar, type AdaptiveToolbarItem } from "./AdaptiveToolbar";
import { MenuItem } from "./MenuItem";
import i18n from "../../i18n";

const container = document.createElement("div");
let cleanup = () => {};
afterEach(async () => {
  await act(async () => cleanup());
  container.remove();
});

test("工具栏按优先级收纳，浮层期间保持入口稳定并恢复宽屏展示", async () => {
  await i18n.changeLanguage("zh-CN");
  let width = 400;
  let selected = 0;
  const rect = spyOn(
    HTMLElement.prototype,
    "getBoundingClientRect",
  ).mockImplementation(function (this: HTMLElement) {
    const measured = this.classList.contains("adaptive-toolbar")
      ? width
      : this.hasAttribute("data-toolbar-item")
        ? 80
        : 30;
    return {
      x: 0,
      y: 200,
      top: 200,
      bottom: 230,
      left: 0,
      right: measured,
      width: measured,
      height: 30,
      toJSON() {},
    };
  });
  document.body.append(container);
  const root = createRoot(container);
  cleanup = () => {
    root.unmount();
    rect.mockRestore();
    disconnect.mockRestore();
  };
  const disconnect = spyOn(ResizeObserver.prototype, "disconnect");
  const items: AdaptiveToolbarItem[] = [
    "images",
    "model",
    "thinking",
    "compact",
  ].map((id, index) => ({
    id,
    priority: [2, 3, 1, 0][index]!,
    control: <button>{id}</button>,
    pageLabel: id,
    menu: (close, showPage) => (
      <MenuItem
        onClick={() =>
          flushSync(() => (id === "thinking" ? showPage(id) : close()))
        }
      >
        {id}
      </MenuItem>
    ),
    page: (close) => (
      <MenuItem
        onClick={() => {
          selected++;
          close();
        }}
      >
        选择等级
      </MenuItem>
    ),
  }));
  const render = async () =>
    act(async () =>
      root.render(
        <MotionConfig reducedMotion="always">
          <AdaptiveToolbar items={[...items]} />
        </MotionConfig>,
      ),
    );
  const hidden = () =>
    [
      ...container.querySelectorAll(
        "[data-toolbar-item].adaptive-toolbar-hidden",
      ),
    ].map((element) => element.getAttribute("data-toolbar-item"));
  const click = async (element: Element) =>
    act(async () =>
      element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
  await render();
  expect(hidden()).toEqual([]);
  width = 280;
  await render();
  expect(hidden()).toEqual(["compact"]);
  width = 200;
  await render();
  expect(hidden()).toEqual(["thinking", "compact"]);
  const more = container.querySelector<HTMLButtonElement>(
    '[aria-label="更多输入选项"]',
  )!;
  await click(more);
  width = 400;
  await render();
  expect(hidden()).toEqual(["thinking", "compact"]);
  let panel = document.querySelector('[role="dialog"]')!;
  await click(
    [...panel.querySelectorAll("button")].find(
      (button) => button.textContent === "thinking",
    )!,
  );
  panel = document.querySelector('[role="dialog"]')!;
  const back = panel.querySelector<HTMLButtonElement>(
    '[aria-label="返回输入选项"]',
  )!;
  expect(document.activeElement).toBe(back);
  await click(back);
  expect(document.activeElement?.textContent).toBe("thinking");
  await click(
    [...panel.querySelectorAll("button")].find(
      (button) => button.textContent === "thinking",
    )!,
  );
  await click(
    [...panel.querySelectorAll("button")].find(
      (button) => button.textContent === "选择等级",
    )!,
  );
  expect(selected).toBe(1);
  expect(document.activeElement).toBe(
    container.querySelector('[data-toolbar-item="images"] button'),
  );
  expect(hidden()).toEqual([]);
  width = 35;
  await render();
  expect(hidden()).toEqual(["images", "model", "thinking", "compact"]);
  expect(
    container.querySelector("[data-toolbar-item]")?.hasAttribute("inert"),
  ).toBe(true);
  await act(async () => root.unmount());
  expect(disconnect).toHaveBeenCalled();
  rect.mockRestore();
  disconnect.mockRestore();
  cleanup = () => {};
});

test("模型名称使用剩余空间，名称充分展示后按内容宽度排列", async () => {
  let width = 230;
  const scrollDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollWidth",
  );
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute("data-toolbar-label") ? 240 : 0;
    },
  });
  const rect = spyOn(
    HTMLElement.prototype,
    "getBoundingClientRect",
  ).mockImplementation(function (this: HTMLElement) {
    const measured = this.classList.contains("adaptive-toolbar")
      ? width
      : this.hasAttribute("data-toolbar-label")
        ? 240
        : this.getAttribute("data-toolbar-item") === "model"
          ? 280
          : this.classList.contains("adaptive-toolbar-more")
            ? 30
            : 60;
    return {
      x: 0,
      y: 200,
      top: 200,
      bottom: 230,
      left: 0,
      right: measured,
      width: measured,
      height: 30,
      toJSON() {},
    };
  });
  document.body.append(container);
  const root = createRoot(container);
  cleanup = () => {
    root.unmount();
    rect.mockRestore();
    if (scrollDescriptor)
      Object.defineProperty(
        HTMLElement.prototype,
        "scrollWidth",
        scrollDescriptor,
      );
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
  };
  const items: AdaptiveToolbarItem[] = [
    {
      id: "model",
      priority: 1,
      flexible: true,
      minimumLabelWidth: 80,
      control: (
        <button>
          <span data-toolbar-label>完整模型名称</span>
        </button>
      ),
      menu: () => null,
    },
    {
      id: "compact",
      priority: 0,
      control: <button>压缩</button>,
      menu: () => null,
    },
  ];
  const render = async () =>
    act(async () =>
      root.render(
        <MotionConfig reducedMotion="always">
          <AdaptiveToolbar items={[...items]} />
        </MotionConfig>,
      ),
    );
  await render();
  const model = container.querySelector<HTMLElement>(
    '[data-toolbar-item="model"]',
  )!;
  const gap =
    parseFloat(
      getComputedStyle(container.querySelector(".adaptive-toolbar")!).columnGap,
    ) || 0;
  expect(parseFloat(model.style.getPropertyValue("--toolbar-item-width"))).toBe(
    width - 60 - gap,
  );
  width = 400;
  await render();
  expect(model.style.getPropertyValue("--toolbar-item-width")).toBe("280px");
  width = 160;
  await render();
  expect(
    container
      .querySelector('[data-toolbar-item="compact"]')
      ?.classList.contains("adaptive-toolbar-hidden"),
  ).toBe(true);
  expect(parseFloat(model.style.getPropertyValue("--toolbar-item-width"))).toBe(
    width - 30 - gap,
  );
});
