import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { MotionConfig } from "motion/react";
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
  const current = "instance" in options ? options.instance : instance;
  return (
    <Composer
      instance={current}
      buttonMode={getComposerButtonMode(current?.status)}
      compactDisabled={current?.status !== "idle"}
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
  await act(async () =>
    root.render(
      <MotionConfig reducedMotion="always">
        <Probe options={options} />
      </MotionConfig>,
    ),
  );
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
  test("实例状态持续可见，活动状态与侧栏采用相同名称和颜色", async () => {
    for (const status of ["streaming", "compacting"] as const) {
      await render({ instance: { ...instance, status } });
      const actions = container.querySelector(".composer-actions")!;
      expect(actions.querySelector('[role="status"]')!.textContent).toContain(
        status === "compacting" ? "压缩中" : "执行中",
      );
      expect(actions.querySelector(".animate-pulse")).not.toBeNull();
      expect(actions.querySelector(".animate-spin")).toBeNull();
      expect(
        actions.querySelector(".composer-agent-status > span")!.className,
      ).toContain(
        status === "compacting" ? "toast-icon-warning" : "color-accent",
      );
      expect(button("停止", actions)).toBeDefined();
      expect(
        container.querySelector(".composer-actions .composer-context"),
      ).not.toBeNull();
    }
    await render();
    expect(container.querySelector(".composer-agent-status")!.textContent).toBe(
      "空闲",
    );
    expect(
      container.querySelector(".composer-agent-status > span")!.className,
    ).toContain("toast-icon-success");
    expect(
      container.querySelector(".composer-agent-status .animate-pulse"),
    ).toBeNull();
    await render({ instance: undefined });
    expect(container.querySelector(".composer-agent-status")!.textContent).toBe(
      "状态等待更新",
    );
    expect(
      container.querySelector(".composer-agent-status .animate-pulse"),
    ).toBeNull();
  });

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
      document.querySelector(
        '[aria-label="选择模型"][role="dialog"]:not([inert])',
      ) === null,
    ).toBe(true);
    expect(document.activeElement === trigger).toBe(true);
  });

  test("思考等级直接选择并关闭菜单", async () => {
    await render();
    const trigger = button("思考等级: high");
    await click(trigger);
    const panel = document.querySelector(
      '[role="dialog"][aria-label="思考等级"]',
    )!;
    expect(
      [...panel.querySelectorAll("[aria-pressed]")].map(
        (element) => element.textContent,
      ),
    ).toEqual(["off", "high"]);
    await click(button("off", panel));
    expect(levels).toEqual(["off"]);
    expect(
      document.querySelector(
        '[aria-label="思考等级"][role="dialog"]:not([inert])',
      ) === null,
    ).toBe(true);
    expect(document.activeElement === trigger).toBe(true);
  });

  test("没有可选等级时保持现有默认等级", async () => {
    await render({ instance: { ...instance, availableModels: [] } });
    await click(button("思考等级: high"));
    const panel = document.querySelector(
      '[aria-label="思考等级"][role="dialog"]',
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

  test("压缩入口打开确认窗口并传递自定义提示", async () => {
    await render();
    await click(button("压缩上下文"));
    const modal = document.querySelector("dialog.fixed-viewport")!;
    await change(modal.querySelector("textarea")!, " keep context ");
    await click(button("开始压缩", modal));
    expect(compacted).toEqual(["keep context"]);
    expect(modal.querySelector("textarea") !== null).toBe(true);
    await act(async () => root.render(null));
    expect(document.querySelector("dialog.fixed-viewport") === null).toBe(true);
  });

  test("运行中与刚完成压缩时保留禁用入口", async () => {
    await render({ compactDisabled: true });
    expect(button("压缩上下文").disabled).toBe(true);
    expect(button("压缩上下文").title).toContain("任务运行");
    await render({ showCompactButton: false, compactDisabled: false });
    expect(button("压缩上下文").disabled).toBe(true);
    expect(button("压缩上下文").textContent).toBe("压缩");
  });

  test("Esc 关闭选择器并恢复入口焦点", async () => {
    await render();
    const trigger = button("思考等级: high");
    await click(trigger);
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(
      document.querySelector(
        '[aria-label="思考等级"][role="dialog"]:not([inert])',
      ) === null,
    ).toBe(true);
    expect(document.activeElement === trigger).toBe(true);
  });

  test("思考能力与用量不可用时保留说明和禁用入口", async () => {
    await render({
      instance: {
        ...instance,
        thinkingLevel: undefined,
        contextUsage: undefined,
      },
    });
    expect(button("思考等级: 不支持").disabled).toBe(true);
    expect(button("压缩上下文").disabled).toBe(true);
    expect(button("发送").disabled).toBe(false);
  });

  test("实例信息等待更新时模型与思考保留等待入口", async () => {
    await render({ instance: undefined });
    expect(button("模型等待更新").disabled).toBe(true);
    expect(button("思考等级: 等待更新").disabled).toBe(true);
  });

  test("英文标签覆盖图片、选择器、压缩与高度入口", async () => {
    await i18n.changeLanguage("en");
    await render({ draft: { text: "", images: [image] } });
    expect(Boolean(button("Preview attached image 1"))).toBe(true);
    expect(Boolean(button("Remove attached image 1"))).toBe(true);
    expect(button("Select model: Current model").textContent).toContain(
      "Model",
    );
    expect(button("Thinking level: high").textContent).toContain("Thinking");
    expect(button("Compact context").textContent).toBe("Compact");
    expect(
      container.querySelector('[aria-label="Resize input area"]') !== null,
    ).toBe(true);
  });
});
