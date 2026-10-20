import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { act, createRef, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  InstanceInfo,
  ImagePayload,
  ThinkingLevel,
} from "../../../../protocol/types";
import type { InputDraft } from "../../stores/useDrafts";
import i18n from "../../i18n";
import { Composer, type ComposerHandle } from "./Composer";
import { getComposerButtonMode } from "./utils";

type Props = ComponentProps<typeof Composer>;
const instance: InstanceInfo = {
  id: "one",
  edgeId: "edge",
  hostname: "host",
  cwd: "/project",
  homedir: "/home/user",
  pid: 1,
  model: { provider: "provider", id: "model", name: "Current model" },
  status: "idle",
  connectedAt: 0,
  lastHeartbeat: 0,
  availableModels: [
    {
      provider: "provider",
      id: "model",
      name: "Current model",
      availableThinkingLevels: ["off", "high"],
    },
    { provider: "other", id: "next", name: "Next model" },
  ],
  thinkingLevel: "high",
  contextUsage: { tokens: 100, contextWindow: 1000, percent: 10 },
};
const image = {
  id: "image",
  data: "AA==",
  mimeType: "image/png",
  previewUrl: "data:image/png;base64,AA==",
};
let root: Root;
let container: HTMLDivElement;
let draft: InputDraft;
let sent: { text: string; images?: ImagePayload[] }[];
let levels: ThinkingLevel[];
let models: [string, string][];
let compacted: (string | undefined)[];
let aborts: number;
let follows: number;
let previews: string[];
let handle: ReturnType<typeof createRef<ComposerHandle>>;

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  handle = createRef<ComposerHandle>();
  sent = [];
  levels = [];
  models = [];
  compacted = [];
  previews = [];
  aborts = 0;
  follows = 0;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  await i18n.changeLanguage("zh-CN");
});

function Probe({ options }: { options: Partial<Props> }) {
  const [value, setValue] = useState<InputDraft>(
    options.draft ?? { text: " hello ", images: [] },
  );
  draft = value;
  const current = options.instance ?? instance;
  return (
    <Composer
      instance={current}
      buttonMode={getComposerButtonMode(current.status)}
      compactDisabled={current.status !== "idle"}
      showCompactButton
      onSendMessage={(text, images) => sent.push({ text, images })}
      onAbort={() => {
        aborts += 1;
      }}
      onSetModel={(provider, id) => models.push([provider, id])}
      onSetThinkingLevel={(level) => levels.push(level)}
      onCompact={(instructions) => compacted.push(instructions)}
      onImageLightbox={(src) => previews.push(src)}
      startBottomFollow={() => {
        follows += 1;
      }}
      {...options}
      ref={handle}
      draft={value}
      onDraftChange={setValue}
    />
  );
}

async function render(options: Partial<Props> = {}) {
  await act(async () => root.render(<Probe options={options} />));
}
async function click(element: Element) {
  await act(async () =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
}
function button(
  label: string,
  parent: ParentNode = container,
): HTMLButtonElement {
  const found = [...parent.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) =>
      element.getAttribute("aria-label") === label ||
      element.textContent === label,
  );
  expect(found).toBeDefined();
  return found!;
}
async function change(textarea: HTMLTextAreaElement, text: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!.call(textarea, text);
  await act(async () =>
    textarea.dispatchEvent(new Event("input", { bubbles: true })),
  );
}
async function key(options: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...options,
  });
  await act(async () =>
    container.querySelector("textarea")!.dispatchEvent(event),
  );
  return event;
}

describe("输入工具栏交互", () => {
  test("输入更新草稿，发送读取最新内容并开始底部跟随", async () => {
    await render();
    await change(container.querySelector("textarea")!, " next message ");
    expect(draft.text).toBe(" next message ");
    await click(button("发送"));
    expect(sent).toEqual([{ text: "next message", images: undefined }]);
    expect(follows).toBe(1);
  });

  test("Enter 发送，Shift+Enter 保留默认换行行为", async () => {
    await render();
    expect((await key({ key: "Enter", shiftKey: true })).defaultPrevented).toBe(
      false,
    );
    expect(sent).toHaveLength(0);
    expect((await key({ key: "Enter" })).defaultPrevented).toBe(true);
    expect(sent[0]?.text).toBe("hello");
  });

  test("IME 确认与 Safari keyCode 229 保持输入状态", async () => {
    await render();
    await key({ key: "Enter", isComposing: true });
    await key({ key: "Enter", keyCode: 229 });
    expect(sent).toHaveLength(0);
  });

  test("空白草稿禁用发送，只有图片也可以发送", async () => {
    await render({ draft: { text: "  ", images: [image] } });
    expect(button("发送").disabled).toBe(false);
    await click(button("发送"));
    expect(sent).toEqual([
      { text: "", images: [{ data: "AA==", mimeType: "image/png" }] },
    ]);
    await click(button("移除附加图片 1"));
    expect(draft.images).toEqual([]);
    expect(button("发送").disabled).toBe(true);
  });

  test("图片保留预览入口和国际化操作标签", async () => {
    await render({ draft: { text: "", images: [image] } });
    await click(button("预览附加图片 1"));
    expect(previews).toEqual([image.previewUrl]);
    expect(container.querySelector("img")!.alt).toBe("附加图片 1");
    await click(button("移除附加图片 1"));
    expect(container.querySelector("img")).toBeNull();
  });

  test("上传入口触发文件选择，保留支持的图片格式", async () => {
    await render();
    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const choose = spyOn(input, "click").mockImplementation(() => {});
    try {
      await click(button("添加图片"));
      expect(choose).toHaveBeenCalledTimes(1);
      expect(input.multiple).toBe(true);
      expect(input.accept).toBe("image/png,image/jpeg,image/gif,image/webp");
    } finally {
      choose.mockRestore();
    }
  });

  test("纯文本粘贴保留默认输入行为", async () => {
    await render();
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer(),
    });
    await act(async () =>
      container.querySelector("textarea")!.dispatchEvent(event),
    );
    expect(event.defaultPrevented).toBe(false);
  });

  test("运行与压缩期间保留停止操作，Enter 不发送", async () => {
    for (const status of ["streaming", "compacting"] as const) {
      await render({ instance: { ...instance, status } });
      expect(container.querySelector('[aria-label="发送"]')).toBeNull();
      await click(button("停止"));
      await key({ key: "Enter" });
    }
    expect(aborts).toBe(2);
    expect(sent).toHaveLength(0);
  });

  test("命令式 focus 保留草稿与末尾光标", async () => {
    await render();
    await act(async () => handle.current!.focus());
    const textarea = container.querySelector("textarea")!;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(draft.text.length);
    expect(textarea.selectionEnd).toBe(draft.text.length);
  });

  test("模型菜单选择原始 provider 和 id 并恢复入口焦点", async () => {
    await render();
    const trigger = button("选择模型: Current model");
    await click(trigger);
    const panel = document.querySelector(
      '[role="dialog"][aria-label="选择模型"]',
    )!;
    const option = [...panel.querySelectorAll("button")].find((element) =>
      element.textContent?.includes("Next model"),
    )!;
    await click(option);
    expect(models).toEqual([["other", "next"]]);
    expect(
      document.querySelector('[aria-label="选择模型"][role="dialog"]'),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("更多选项直接选择思考等级并关闭菜单", async () => {
    await render();
    const trigger = button("更多输入选项");
    await click(trigger);
    const panel = document.querySelector(
      '[role="dialog"][aria-label="更多输入选项"]',
    )!;
    expect(
      [...panel.querySelectorAll("[aria-pressed]")].map(
        (element) => element.textContent,
      ),
    ).toEqual(["off", "high"]);
    await click(button("off", panel));
    expect(levels).toEqual(["off"]);
    expect(
      document.querySelector('[aria-label="更多输入选项"][role="dialog"]'),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("没有可选等级时保持现有默认等级", async () => {
    await render({ instance: { ...instance, availableModels: [] } });
    await click(button("更多输入选项"));
    const panel = document.querySelector(
      '[aria-label="更多输入选项"][role="dialog"]',
    )!;
    expect(
      [...panel.querySelectorAll("[aria-pressed]")].map(
        (element) => element.textContent,
      ),
    ).toEqual(["off", "minimal", "low", "medium", "high"]);
  });

  test("上下文提供完整用量，压缩后暂缺 tokens 时显示等待更新", async () => {
    await render();
    await click(button("上下文用量: 100 / 1.0k (10%)"));
    const panel = document.querySelector(
      '[aria-label="上下文用量"][role="dialog"]',
    )!;
    expect(panel.textContent).toContain("已用 tokens100");
    expect(panel.textContent).toContain("上下文窗口1,000");
    expect(
      panel
        .querySelector('[role="progressbar"]')!
        .getAttribute("aria-valuenow"),
    ).toBe("10");
    await render({
      instance: {
        ...instance,
        contextUsage: { tokens: null, percent: null, contextWindow: 1000 },
      },
    });
    expect(panel.textContent).toContain("等待更新");
    expect(panel.querySelector('[role="progressbar"]')).toBeNull();
    expect(
      container.querySelector('[aria-label="上下文用量: 等待更新"]'),
    ).not.toBeNull();
  });

  test("菜单中的压缩操作打开确认窗口并传递自定义提示", async () => {
    await render();
    await click(button("更多输入选项"));
    await click(
      button(
        "压缩上下文",
        document.querySelector('[aria-label="更多输入选项"][role="dialog"]')!,
      ),
    );
    expect(
      document.querySelector('[aria-label="更多输入选项"][role="dialog"]'),
    ).toBeNull();
    const modal = document.querySelector("dialog.fixed-viewport")!;
    await change(modal.querySelector("textarea")!, " keep context ");
    await click(button("开始压缩", modal));
    expect(compacted).toEqual(["keep context"]);
    expect(modal.getAttribute("data-presence")).toBe("exiting");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(document.querySelector("dialog.fixed-viewport") === null).toBe(true);
  });

  test("运行中禁用压缩，已经压缩时隐藏对应操作", async () => {
    await render({ compactDisabled: true });
    await click(button("更多输入选项"));
    const panel = document.querySelector(
      '[aria-label="更多输入选项"][role="dialog"]',
    )!;
    expect(button("压缩上下文", panel).disabled).toBe(true);
    await render({ showCompactButton: false });
    expect(
      [...document.querySelectorAll("button")].some(
        (element) =>
          element.getAttribute("aria-label") === "压缩上下文" ||
          element.textContent === "压缩上下文",
      ),
    ).toBe(false);
  });

  test("Esc 关闭辅助菜单并恢复入口焦点", async () => {
    await render();
    const trigger = button("更多输入选项");
    await click(trigger);
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(
      document.querySelector('[aria-label="更多输入选项"][role="dialog"]'),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test("不支持思考的模型隐藏思考选项，缺少上下文时保留输入", async () => {
    await render({
      instance: {
        ...instance,
        thinkingLevel: undefined,
        contextUsage: undefined,
      },
    });
    expect(container.querySelector('[aria-label="更多输入选项"]')).toBeNull();
    expect(container.querySelector('[aria-label^="思考等级"]')).toBeNull();
    expect(button("发送").disabled).toBe(false);
  });

  test("英文标签覆盖图片、更多选项与上下文", async () => {
    await i18n.changeLanguage("en");
    await render({ draft: { text: "", images: [image] } });
    expect(button("Preview attached image 1")).toBeDefined();
    expect(button("Remove attached image 1")).toBeDefined();
    await click(button("More input options"));
    const panel = document.querySelector(
      '[aria-label="More input options"][role="dialog"]',
    )!;
    expect(panel.textContent).toContain("Thinking level");
    expect(panel.textContent).toContain("Context usage");
  });
});
