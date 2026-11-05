import { afterEach, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import { AdaptiveToolbar, type AdaptiveToolbarItem } from "./AdaptiveToolbar";
import { MenuItem } from "./MenuItem";
import i18n from "../../i18n";

function mockLayoutWidths(
  widthOf: (element: Element) => number,
  scaleOf: (element: Element) => number = () => 1,
) {
  const originalStyle = window.getComputedStyle;
  const computed = spyOn(window, "getComputedStyle").mockImplementation(
    (element, pseudo) => {
      const style = document.createElement("div").style;
      style.cssText = originalStyle.call(window, element, pseudo).cssText;
      style.boxSizing = "border-box";
      style.width = `${widthOf(element)}px`;
      return style;
    },
  );
  const rect = spyOn(
    HTMLElement.prototype,
    "getBoundingClientRect",
  ).mockImplementation(function (this: HTMLElement) {
    const width = widthOf(this) * scaleOf(this);
    return {
      x: 0,
      y: 200,
      top: 200,
      bottom: 230,
      left: 0,
      right: width,
      width,
      height: 30,
      toJSON() {},
    };
  });
  return () => {
    computed.mockRestore();
    rect.mockRestore();
  };
}

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
  const restoreWidths = mockLayoutWidths((element) =>
    element.classList.contains("adaptive-toolbar")
      ? width
      : element.hasAttribute("data-toolbar-item")
        ? 80
        : 30,
  );
  document.body.append(container);
  const root = createRoot(container);
  cleanup = () => {
    root.unmount();
    restoreWidths();
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
  restoreWidths();
  disconnect.mockRestore();
  cleanup = () => {};
});

test("模型名称按内容与剩余空间排列，缩放期间重复测量保持宽度", async () => {
  let width = 230;
  let contentWidth = 240;
  let pressed = false;
  const restoreWidths = mockLayoutWidths(
    (element) => {
      const model = container.querySelector<HTMLElement>(
        '[data-toolbar-item="model"]',
      );
      const modelWidth =
        Number.parseFloat(
          model?.style.getPropertyValue("--toolbar-item-width") ?? "",
        ) || 280;
      if (element.classList.contains("adaptive-toolbar")) return width;
      if (element.hasAttribute("data-toolbar-label-content"))
        return contentWidth;
      if (element.hasAttribute("data-toolbar-label")) return modelWidth - 40;
      if (element === model || element === model?.querySelector("button"))
        return modelWidth;
      return element.classList.contains("adaptive-toolbar-more") ? 30 : 60;
    },
    (element) =>
      pressed &&
      (element.tagName === "BUTTON" ||
        element.hasAttribute("data-toolbar-label") ||
        element.hasAttribute("data-toolbar-label-content"))
        ? 0.97
        : 1,
  );
  document.body.append(container);
  const root = createRoot(container);
  cleanup = () => {
    root.unmount();
    restoreWidths();
  };
  const items: AdaptiveToolbarItem[] = [
    {
      id: "model",
      priority: 1,
      flexible: true,
      minimumLabelWidth: 80,
      control: (
        <button>
          <span data-toolbar-label>
            <span data-toolbar-label-content>完整模型名称</span>
          </span>
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
  width = 400;
  pressed = true;
  for (let index = 0; index < 3; index++) {
    await render();
    expect(model.style.getPropertyValue("--toolbar-item-width")).toBe("280px");
  }
  model.style.setProperty("--toolbar-item-width", "296.375px");
  await render();
  expect(model.style.getPropertyValue("--toolbar-item-width")).toBe("280px");
  pressed = false;
  await render();
  expect(model.style.getPropertyValue("--toolbar-item-width")).toBe("280px");
  contentWidth = 64.71875;
  await render();
  expect(model.style.getPropertyValue("--toolbar-item-width")).toBe("105px");
});
