import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import mermaid from "mermaid";
import DOMPurify from "dompurify";
import i18n from "../../i18n";
import { useSettings } from "../../stores/useSettings";
import { MarkdownRenderer } from "./Markdown";

let root: Root | undefined;
let container: HTMLDivElement;
let renderSpy: ReturnType<typeof spyOn<typeof mermaid, "render">>;
let sanitizeSpy: ReturnType<typeof spyOn<typeof DOMPurify, "sanitize">>;

async function render(content: string, streaming = false) {
  if (!root) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }
  await act(async () => {
    root!.render(<MarkdownRenderer content={content} streaming={streaming} />);
  });
}

async function waitForRender(delay = 20) {
  await act(async () => {
    await Bun.sleep(delay);
  });
}

function temporaryContainers() {
  return Array.from(document.body.children).filter(
    (element) => (element as HTMLElement).style.left === "-100000px",
  );
}

const diagram = "```mermaid\nflowchart LR\nA[开始] --> B[结束]\n```";
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text>开始</text></svg>';
const result = { svg, diagramType: "flowchart" };

beforeEach(() => {
  renderSpy = spyOn(mermaid, "render").mockResolvedValue(result);
  sanitizeSpy = spyOn(DOMPurify, "sanitize").mockReturnValue(svg);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  renderSpy.mockRestore();
  sanitizeSpy.mockRestore();
  useSettings.setState({ resolvedTheme: "light" });
  await i18n.changeLanguage("zh-CN");
});

describe("MermaidBlock", () => {
  test("渲染图表并保留普通代码块", async () => {
    await render(diagram + "\n\n```typescript\nconst value = 1;\n```");
    await waitForRender();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy.mock.calls[0]![1]).toBe(
      "flowchart LR\nA[开始] --> B[结束]",
    );
    const image = container.querySelector("img")!;
    expect(decodeURIComponent(image.getAttribute("src")!.split(",")[1]!)).toBe(
      svg,
    );
    expect(container.querySelector("pre")!.textContent).toContain(
      "const value = 1;",
    );
    expect(container.textContent).not.toContain("A[开始]");
  });

  test("渲染失败时显示源码和国际化提示", async () => {
    renderSpy.mockRejectedValue(new Error("syntax"));
    await render(diagram);
    await waitForRender();
    expect(container.textContent).toContain("图表渲染失败");
    expect(container.querySelector("pre")!.textContent).toContain("A[开始]");
    await act(async () => {
      await i18n.changeLanguage("en");
    });
    expect(container.textContent).toContain("Unable to render diagram");
  });

  test("流式更新使用延迟渲染并隐藏解析错误", async () => {
    renderSpy.mockRejectedValue(new Error("incomplete"));
    await render("```mermaid\nflowchart LR\nA[", true);
    await render(diagram, true);
    await waitForRender();
    expect(renderSpy).not.toHaveBeenCalled();
    await waitForRender(320);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain("图表渲染失败");
    expect(container.querySelector("pre")).toBeNull();
    await render(diagram, false);
    await waitForRender();
    expect(container.textContent).toContain("图表渲染失败");
  });

  test("内容变化时忽略过期结果并继续渲染最新内容", async () => {
    let resolveFirst!: (value: typeof result) => void;
    let resolveSecond!: (value: typeof result) => void;
    renderSpy
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    await render(diagram);
    await waitForRender();
    await render("```mermaid\nflowchart LR\nC --> D\n```");
    await waitForRender();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    await act(async () => resolveFirst(result));
    await waitForRender();
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(renderSpy.mock.calls[1]![1]).toBe("flowchart LR\nC --> D");
    expect(container.querySelector("img")).toBeNull();
    expect(sanitizeSpy).not.toHaveBeenCalled();
    await act(async () => resolveSecond(result));
    await waitForRender();
    expect(container.querySelector("img")).not.toBeNull();
    expect(temporaryContainers()).toHaveLength(0);
  });

  test("主题切换重新渲染图表", async () => {
    const themes: string[] = [];
    renderSpy.mockImplementation(async () => {
      themes.push(mermaid.mermaidAPI.getConfig().theme!);
      return result;
    });
    await render(diagram);
    await waitForRender();
    await act(async () => useSettings.setState({ resolvedTheme: "dark" }));
    await waitForRender();
    expect(themes).toEqual(["default", "dark"]);
  });

  test("复制 Mermaid 源码", async () => {
    const copySpy = spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    try {
      await render(diagram);
      await waitForRender();
      await act(async () => container.querySelector("button")!.click());
      expect(copySpy).toHaveBeenCalledWith("flowchart LR\nA[开始] --> B[结束]");
      expect(container.textContent).toContain("已复制");
    } finally {
      copySpy.mockRestore();
    }
  });

  test("图表保持适应卡片宽度，通过现有图片预览查看原始尺寸", async () => {
    await render(diagram);
    await waitForRender();
    const image = container.querySelector("img")!;
    expect(image.className).toContain("max-w-full h-auto");
    const expand = container.querySelector<HTMLButtonElement>(
      '[aria-haspopup="dialog"]',
    )!;
    expect(expand.textContent).toContain("放大查看");
    expand.focus();
    await act(async () => expand.click());
    const preview = document.body.querySelector('[role="dialog"]')!;
    expect(preview.parentElement).toBe(document.body);
    expect(preview.querySelector("img")!.getAttribute("src")).toBe(
      image.getAttribute("src"),
    );
    expect(renderSpy).toHaveBeenCalledTimes(1);
    await act(async () => preview.querySelector("button")!.click());
    expect(preview.querySelector("img")!.className).toContain("max-w-none");
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(expand);
  });

  test("全屏预览随主题更新，生成期间保持窗口、焦点和尺寸模式", async () => {
    await render(diagram);
    await waitForRender();
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!
        .click();
    });
    const preview = document.body.querySelector('[role="dialog"]')!;
    const close = preview.querySelector<HTMLButtonElement>(
      '[aria-label="关闭预览"]',
    )!;
    const initialImage = preview.querySelector("img")!;
    Object.defineProperties(initialImage, {
      naturalWidth: { value: 4000 },
      naturalHeight: { value: 2000 },
    });
    await act(async () => initialImage.dispatchEvent(new Event("load")));
    await act(async () =>
      preview.querySelector<HTMLButtonElement>("button")!.click(),
    );
    const viewport = preview.querySelector<HTMLDivElement>('[role="region"]')!;
    viewport.scrollLeft = 1000;
    viewport.scrollTop = 500;
    close.focus();
    const previousSrc = preview.querySelector("img")!.getAttribute("src");
    const darkSvg = svg.replace("开始", "暗黑主题");
    sanitizeSpy.mockReturnValue(darkSvg);
    let finish!: (value: typeof result) => void;
    renderSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    await act(async () => useSettings.setState({ resolvedTheme: "dark" }));
    await waitForRender();
    expect(document.body.querySelector('[role="dialog"]')).toBe(preview);
    expect(preview.querySelector("img")).toBeNull();
    expect(preview.querySelector('[role="status"]')!.textContent).toContain(
      "图表生成中",
    );
    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe("hidden");
    const space = viewport.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    expect(space.style.width).toBe("4000px");
    expect(space.style.height).toBe("2000px");
    expect(viewport.scrollLeft).toBe(1000);
    expect(viewport.scrollTop).toBe(500);

    await act(async () => finish(result));
    const image = preview.querySelector("img")!;
    expect(image.getAttribute("src")).not.toBe(previousSrc);
    expect(image.getAttribute("src")).toBe(
      container.querySelector("img")!.getAttribute("src"),
    );
    expect(image.className).toContain("max-w-none max-h-none");
    expect(image.getAttribute("width")).toBe("4000");
    expect(image.getAttribute("height")).toBe("2000");
    expect(viewport.scrollLeft).toBe(1000);
    expect(viewport.scrollTop).toBe(500);
    expect(preview.querySelector('[role="status"]')).toBeNull();
    expect(document.activeElement).toBe(close);
  });

  test("全屏预览重新渲染失败时显示源码，后续主题更新可恢复图表", async () => {
    await render(diagram);
    await waitForRender();
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!
        .click();
    });
    const preview = document.body.querySelector('[role="dialog"]')!;
    renderSpy.mockRejectedValueOnce(new Error("render"));
    await act(async () => useSettings.setState({ resolvedTheme: "dark" }));
    await waitForRender();
    expect(document.body.querySelector('[role="dialog"]')).toBe(preview);
    expect(preview.querySelector("img")).toBeNull();
    expect(preview.querySelector('[role="status"]')!.textContent).toContain(
      "图表渲染失败",
    );
    expect(preview.querySelector("pre")!.textContent).toContain("A[开始]");
    await act(async () => preview.querySelector("pre")!.click());
    expect(document.body.querySelector('[role="dialog"]')).toBe(preview);

    await act(async () => useSettings.setState({ resolvedTheme: "light" }));
    await waitForRender();
    expect(preview.querySelector("img")!.getAttribute("src")).toBe(
      container.querySelector("img")!.getAttribute("src"),
    );
    expect(preview.querySelector("pre")).toBeNull();
  });

  test("生成期间关闭全屏预览，完成后保持关闭", async () => {
    await render(diagram);
    await waitForRender();
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!
        .click();
    });
    let finish!: (value: typeof result) => void;
    renderSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => useSettings.setState({ resolvedTheme: "dark" }));
    await waitForRender();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => finish(result));
    expect(container.querySelector("img")).not.toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  test("生成期间和渲染失败时隐藏放大入口，成功后显示国际化操作", async () => {
    await render(diagram, true);
    expect(container.querySelector('[aria-haspopup="dialog"]')).toBeNull();
    await render(diagram);
    await waitForRender();
    await act(async () => i18n.changeLanguage("en"));
    expect(
      container.querySelector('[aria-haspopup="dialog"]')!.textContent,
    ).toContain("Enlarge");
    renderSpy.mockRejectedValue(new Error("syntax"));
    await render("```mermaid\ninvalid\n```");
    await waitForRender();
    expect(container.querySelector('[aria-haspopup="dialog"]')).toBeNull();
  });

  test("多个图表共享串行渲染队列并使用独立 ID", async () => {
    let finish!: (value: typeof result) => void;
    renderSpy.mockImplementationOnce(async (_id, _source, target) => {
      expect(target!.isConnected).toBe(true);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    await render(diagram + "\n\n```mermaid\nflowchart LR\nC --> D\n```");
    await waitForRender();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(temporaryContainers()).toHaveLength(1);
    await act(async () => finish(result));
    await waitForRender();
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(renderSpy.mock.calls[0]![0]).not.toBe(renderSpy.mock.calls[1]![0]);
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(temporaryContainers()).toHaveLength(0);
  });

  test("单个图表失败后继续渲染后续图表并清理临时容器", async () => {
    renderSpy.mockRejectedValueOnce(new Error("syntax"));
    await render(diagram + "\n\n```mermaid\nflowchart LR\nC --> D\n```");
    await waitForRender();
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("图表渲染失败");
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(temporaryContainers()).toHaveLength(0);
  });

  test("卸载时取消等待中的调用并清理运行中的临时容器", async () => {
    await render(diagram, true);
    await act(async () => root!.unmount());
    root = undefined;
    container.remove();
    await waitForRender(320);
    expect(renderSpy).not.toHaveBeenCalled();

    let finish!: (value: typeof result) => void;
    renderSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render(diagram);
    await waitForRender();
    expect(temporaryContainers()).toHaveLength(1);
    await act(async () => root!.unmount());
    root = undefined;
    await act(async () => finish(result));
    await waitForRender();
    expect(sanitizeSpy).not.toHaveBeenCalled();
    expect(temporaryContainers()).toHaveLength(0);
  });

  test("保护安全配置并使用 SVG sanitizer", async () => {
    await render(diagram);
    await waitForRender();
    expect(sanitizeSpy).toHaveBeenCalledWith(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100" height="50"><text>开始</text></svg>',
      { USE_PROFILES: { svg: true, svgFilters: true } },
    );
    const config = mermaid.mermaidAPI.getConfig();
    expect(config.securityLevel).toBe("strict");
    expect(config.htmlLabels).toBe(false);
    expect(config.secure).toContain("securityLevel");
    expect(config.secure).toContain("suppressErrorRendering");
  });
});
