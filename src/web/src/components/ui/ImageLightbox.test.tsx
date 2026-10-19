import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import i18n from "../../i18n";
import { ImageLightbox } from "./ImageLightbox";

let root: Root;
let container: HTMLDivElement;
let trigger: HTMLButtonElement;
let closeCount: number;
let previousOverflow: string;

const src =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="2000"></svg>',
  );

async function render(zoomable = false, imageSrc = src) {
  await act(async () => {
    root.render(
      <ImageLightbox
        src={imageSrc}
        alt="Mermaid"
        zoomable={zoomable}
        placeholder={<p role="status">{i18n.t("entries.mermaidLoading")}</p>}
        onClose={() => closeCount++}
      />,
    );
  });
}

function dialog() {
  return document.body.querySelector<HTMLDivElement>('[role="dialog"]')!;
}

async function loadImage(width = 4000, height = 2000) {
  const image = dialog().querySelector("img")!;
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: width },
    naturalHeight: { configurable: true, value: height },
  });
  await act(async () => image.dispatchEvent(new Event("load")));
  return image;
}

beforeEach(() => {
  container = document.createElement("div");
  trigger = document.createElement("button");
  document.body.append(container, trigger);
  trigger.focus();
  root = createRoot(container);
  closeCount = 0;
  previousOverflow = document.body.style.overflow;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  trigger.remove();
  document.body.style.overflow = previousOverflow;
  await i18n.changeLanguage("zh-CN");
});

describe("ImageLightbox", () => {
  test("默认图片预览保持适应窗口，通过 Portal 展示", async () => {
    await render();
    expect(dialog().parentElement).toBe(document.body);
    expect(container.querySelector("img")).toBeNull();
    expect(dialog().querySelectorAll("button")).toHaveLength(1);
    expect(dialog().querySelector("img")!.className).toContain("max-w-[90vw]");
    expect(dialog().querySelector("img")!.className).not.toContain("bg-[");
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog().querySelector("button"));
  });

  test("图表阅读底色使用现有主题颜色，两种尺寸模式保持一致", async () => {
    await render(true);
    const image = dialog().querySelector("img")!;
    expect(image.className).toContain("bg-[var(--btn-solid)]");
    expect(dialog().className).toContain("bg-black/60 backdrop-blur-[30px]");
    expect(dialog().querySelector('[role="region"]')!.className).not.toContain(
      "bg-[",
    );
    await act(async () => dialog().querySelector("button")!.click());
    expect(image.className).toContain("bg-[var(--btn-solid)]");
  });

  test("切换原始尺寸，支持双向滚动并恢复适应窗口", async () => {
    await render(true);
    const button = dialog().querySelector("button")!;
    const image = dialog().querySelector("img")!;
    const viewport = dialog().querySelector<HTMLDivElement>('[role="region"]')!;
    expect(image.className).toContain("max-w-full max-h-full");
    expect(button.textContent).toBe("原始尺寸");
    expect(button.className).toContain("glass-panel");
    expect(viewport.className).toContain("overflow-auto");
    expect(viewport.tabIndex).toBe(0);
    await act(async () => button.click());
    expect(image.className).toContain("max-w-none max-h-none");
    expect(button.textContent).toBe("适应窗口");
    viewport.scrollTop = 500;
    viewport.scrollLeft = 1000;
    await act(async () => button.click());
    expect(image.className).toContain("max-w-full max-h-full");
    expect(viewport.scrollTop).toBe(0);
    expect(viewport.scrollLeft).toBe(0);
    expect(closeCount).toBe(0);
  });

  test("原始尺寸重新生成期间保留图片尺寸和滚动位置", async () => {
    await render(true);
    await loadImage();
    await act(async () => dialog().querySelector("button")!.click());
    const viewport = dialog().querySelector<HTMLDivElement>('[role="region"]')!;
    viewport.scrollLeft = 1000;
    viewport.scrollTop = 500;

    await render(true, "");
    expect(dialog().querySelector("img")).toBeNull();
    const space = viewport.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    expect(space.style.width).toBe("4000px");
    expect(space.style.height).toBe("2000px");
    expect(viewport.scrollLeft).toBe(1000);
    expect(viewport.scrollTop).toBe(500);
    expect(dialog().querySelector('[role="status"]')!.textContent).toContain(
      "图表生成中",
    );
    expect(viewport.contains(dialog().querySelector('[role="status"]'))).toBe(
      false,
    );

    // 生成期间仍可改变阅读位置，新图片加载后继续使用当前位置
    viewport.scrollLeft = 1200;
    viewport.scrollTop = 600;
    await render(true, src + "#dark");
    const image = dialog().querySelector("img")!;
    expect(image.getAttribute("width")).toBe("4000");
    expect(image.getAttribute("height")).toBe("2000");
    await loadImage();
    expect(viewport.scrollLeft).toBe(1200);
    expect(viewport.scrollTop).toBe(600);
    expect(dialog().querySelector('[role="status"]')).toBeNull();

    await render(true, "");
    expect(
      viewport.querySelector<HTMLElement>('[aria-hidden="true"]')!.style.width,
    ).toBe("4000px");
    expect(viewport.scrollLeft).toBe(1200);
    expect(viewport.scrollTop).toBe(600);
  });

  test("新图片加载完成后使用新的原始尺寸", async () => {
    await render(true);
    await loadImage();
    await act(async () => dialog().querySelector("button")!.click());
    await render(true, "");
    await render(true, src + "#smaller");
    const image = dialog().querySelector("img")!;
    expect(image.getAttribute("width")).toBe("4000");
    expect(image.getAttribute("height")).toBe("2000");
    await loadImage(1600, 1000);
    expect(image.getAttribute("width")).toBe("1600");
    expect(image.getAttribute("height")).toBe("1000");
  });

  test("生成期间切换尺寸模式继续返回起始位置", async () => {
    await render(true);
    await loadImage();
    await act(async () => dialog().querySelector("button")!.click());
    const viewport = dialog().querySelector<HTMLDivElement>('[role="region"]')!;
    viewport.scrollLeft = 1000;
    viewport.scrollTop = 500;
    await render(true, "");
    await act(async () => dialog().querySelector("button")!.click());
    const space = viewport.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    expect(space.style.width).toBe("");
    expect(space.style.height).toBe("");
    expect(viewport.scrollLeft).toBe(0);
    expect(viewport.scrollTop).toBe(0);
    await render(true, src + "#dark");
    const image = dialog().querySelector("img")!;
    expect(image.hasAttribute("width")).toBe(false);
    expect(image.hasAttribute("height")).toBe(false);
    expect(image.className).toContain("max-w-full max-h-full");
  });

  test("图片和控件点击保留预览，背景及关闭按钮触发关闭", async () => {
    await render(true);
    await act(async () => dialog().querySelector("img")!.click());
    expect(closeCount).toBe(0);
    await act(async () => dialog().click());
    expect(closeCount).toBe(1);
    await act(async () => {
      dialog()
        .querySelector<HTMLButtonElement>('[aria-label="关闭预览"]')!
        .click();
    });
    expect(closeCount).toBe(2);
  });

  test("Esc 关闭，卸载恢复背景滚动与入口焦点", async () => {
    document.body.style.overflow = "auto";
    await render(true);
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(closeCount).toBe(1);
    await act(async () => root.render(null));
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(trigger);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(closeCount).toBe(1);
  });

  test("键盘焦点在预览控件和滚动区域之间循环", async () => {
    await render(true);
    const first = dialog().querySelector("button")!;
    const last = dialog().querySelector<HTMLDivElement>('[role="region"]')!;
    first.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(last);
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(first);
  });

  test("预览操作支持英文", async () => {
    await i18n.changeLanguage("en");
    await render(true);
    expect(dialog().textContent).toContain("Actual size");
    expect(
      dialog().querySelector('[aria-label="Close preview"]'),
    ).not.toBeNull();
    await act(async () => dialog().querySelector("button")!.click());
    expect(dialog().textContent).toContain("Fit to window");
  });
});
