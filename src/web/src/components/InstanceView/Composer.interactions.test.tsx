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
  test("More 内的模型与思考选择使用同一浮层，保留操作结果和入口焦点", async () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    const rect = spyOn(
      HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(function (this: HTMLElement) {
      const value = original.call(this);
      if (this.classList.contains("adaptive-toolbar"))
        return { ...value, width: 44, toJSON() {} };
      if (this.hasAttribute("data-toolbar-item"))
        return { ...value, width: 100, toJSON() {} };
      if (this.classList.contains("adaptive-toolbar-more"))
        return { ...value, width: 44, toJSON() {} };
      return value;
    });
    try {
      await render();
      const more = button("更多输入选项");
      await click(more);
      let panel = document.querySelector('[role="dialog"]')!;
      const modelEntry = [...panel.querySelectorAll("button")].find((entry) =>
        entry.textContent?.includes("Current model"),
      )!;
      await click(modelEntry);
      expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
      panel = document.querySelector('[role="dialog"]')!;
      await click(
        [...panel.querySelectorAll("button")].find((entry) =>
          entry.textContent?.includes("Next model"),
        )!,
      );
      expect(models).toEqual([["other", "next"]]);
      expect(document.activeElement).toBe(more);
      await click(more);
      panel = document.querySelector('[role="dialog"]')!;
      await click(
        [...panel.querySelectorAll("button")].find((entry) =>
          entry.textContent?.includes("思考"),
        )!,
      );
      panel = document.querySelector('[role="dialog"]')!;
      await click(button("off", panel));
      expect(levels).toEqual(["off"]);
      expect(document.activeElement).toBe(more);
      await click(more);
      panel = document.querySelector('[role="dialog"]')!;
      await click(button("压缩上下文", panel));
      expect(document.querySelector("dialog[open]")).not.toBeNull();
    } finally {
      rect.mockRestore();
    }
  });

  test("常用品牌首次渲染直接显示图标，入口保持名称与尺寸", () => {
    const models = [
      ["openai/gpt-5", "OpenAI"],
      ["anthropic/claude-sonnet-4", "Claude"],
      ["google/gemini-2.5-pro", "Gemini"],
      ["moonshotai/kimi-k2", "MoonshotAI"],
      ["qwen/qwen3", "Qwen"],
      ["z-ai/glm-5", "Z.ai"],
      ["x-ai/grok-4", "Grok"],
      ["deepseek/deepseek-r1", "DeepSeek"],
      ["minimax/minimax-m2.5", "Minimax"],
      ["tencent/hunyuan-2", "Hunyuan"],
    ];
    for (const [id, title] of models) {
      act(() => {
        root.render(
          <MotionConfig reducedMotion="always">
            <Probe
              options={{
                instance: {
                  ...instance,
                  model: { provider: "openrouter", id: id!, name: title },
                },
              }}
            />
          </MotionConfig>,
        );
      });
      const trigger = button(`选择模型: ${title}`);
      const icon = trigger.querySelector<HTMLElement>(".model-brand-icon")!;
      expect(trigger.querySelector(".composer-model-name")!.textContent).toBe(
        title!,
      );
      expect(icon.style.width).toBe("14px");
      expect(icon.style.height).toBe("14px");
      expect(icon.querySelector("title")!.textContent).toBe(title!);
    }
  });

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

  test("模型入口和菜单根据 identifier 自动展示品牌图标", async () => {
    const availableModels = [
      { provider: "openrouter", id: "openai/gpt-5", name: "GPT model" },
      {
        provider: "openrouter",
        id: "anthropic/claude-sonnet-4",
        name: "Claude model",
      },
      {
        provider: "openrouter",
        id: "deepseek/deepseek-r1",
        name: "DeepSeek model",
      },
      {
        provider: "openrouter",
        id: "google/gemini-2.5-pro",
        name: "Gemini model",
      },
      { provider: "openrouter", id: "qwen/qwen3", name: "Qwen model" },
      { provider: "openrouter", id: "x-ai/grok-4", name: "Grok model" },
      { provider: "openrouter", id: "moonshotai/kimi-k2", name: "Kimi model" },
      {
        provider: "openrouter",
        id: "minimax/minimax-m2.5",
        name: "Minimax model",
      },
      {
        provider: "openrouter",
        id: "tencent/hunyuan-2",
        name: "Hunyuan model",
      },
      { provider: "openrouter", id: "z-ai/glm-5", name: "GLM model" },
    ];
    const titles = [
      "OpenAI",
      "Claude",
      "DeepSeek",
      "Gemini",
      "Qwen",
      "Grok",
      "MoonshotAI",
      "Minimax",
      "Hunyuan",
      "Z.ai",
    ];
    const brandColors = new Map([
      ["Claude", "#D97757"],
      ["DeepSeek", "#4D6BFE"],
    ]);
    for (const [index, model] of availableModels.entries()) {
      await render({ instance: { ...instance, model, availableModels } });
      await act(async () => {
        await import("@lobehub/icons/es/features/ModelIcon");
      });
      const trigger = button(`选择模型: ${model.name}`);
      expect(trigger.querySelector(".composer-model-name")!.textContent).toBe(
        model.name,
      );
      expect(
        trigger.querySelector(".model-brand-icon title")!.textContent,
      ).toBe(titles[index]);
      expect(
        trigger.querySelector(".model-brand-icon")!.getAttribute("aria-hidden"),
      ).toBe("true");
      expect(
        trigger.querySelector(".model-brand-icon svg")!.getAttribute("width"),
      ).toBe("14");
      const brandColor = brandColors.get(titles[index]!);
      if (brandColor) {
        expect(
          trigger.querySelector(".model-brand-icon path")!.getAttribute("fill"),
        ).toBe(brandColor);
      }
    }
    await click(button("选择模型: GLM model"));
    const panel = document.querySelector(
      '[role="dialog"][aria-label="选择模型"]',
    )!;
    expect(
      [...panel.querySelectorAll(".model-brand-icon title")].map(
        (element) => element.textContent,
      ),
    ).toEqual(titles);
    const menuIcons = [...panel.querySelectorAll(".model-brand-icon")];
    expect(menuIcons[1]!.querySelector("path")!.getAttribute("fill")).toBe(
      brandColors.get("Claude")!,
    );
    expect(menuIcons[2]!.querySelector("path")!.getAttribute("fill")).toBe(
      brandColors.get("DeepSeek")!,
    );
    expect(panel.querySelector(".ui-menu-section")!.textContent).toBe(
      "openrouter",
    );
    expect(panel.querySelector(".ui-menu-section svg")).toBeNull();
    const first = panel.querySelector<HTMLButtonElement>(".ui-menu-item")!;
    expect(
      first.querySelector(".model-brand-icon svg")!.getAttribute("width"),
    ).toBe("18");
    await click(first);
    expect(models).toEqual([["openrouter", "openai/gpt-5"]]);
  });

  test("具体模型优先级与其他品牌使用完整 Lobe 匹配规则", async () => {
    const { modelMappings } =
      await import("@lobehub/icons/es/features/modelConfig");
    const ids = [
      "openai/sora",
      "openai/dall-e-3",
      "glm-4.1v-thinking",
      "google/gemini-3-pro-image-preview",
      "gemini-2.5-flash-image",
      "mistral/mistral-large",
      "openai/gpt-3.5-turbo",
      "OPENAI/GPT-4O",
      "gpt-oss-120b",
      "o1-preview",
      "openai/o3",
      "openai/o4-mini",
      "text-embedding-3-small",
      "tts-1",
      "whisper-1",
      "codex-mini-latest",
      "qwq-32b",
      "qvq-max",
      "wan2.1-video",
      "hy3-preview",
      "hy4-preview",
      "abab-6.5",
    ];
    for (const id of ids) {
      await render({
        instance: { ...instance, model: { provider: "provider", id } },
      });
      await act(async () => {
        await import("@lobehub/icons/es/features/ModelIcon");
      });
      const expected = modelMappings.find(({ keywords }) =>
        keywords.some((keyword) =>
          new RegExp(keyword, "i").test(id.toLowerCase()),
        ),
      )!;
      expect(
        button(`选择模型: ${id}`).querySelector(".model-brand-icon title")!
          .textContent,
      ).toBe((expected.Icon as typeof expected.Icon & { title: string }).title);
      if (expected.props?.type) {
        expect(
          button(`选择模型: ${id}`)
            .querySelector(".model-brand-icon svg")!
            .getAttribute("type"),
        ).toBe(expected.props.type);
      }
    }
  });

  test("未知模型展示通用图标，禁用入口保留品牌图标与思考提示", async () => {
    await render();
    await act(async () => {
      await import("@lobehub/icons/es/features/ModelIcon");
    });
    expect(
      button("选择模型: Current model").querySelector(
        ".model-brand-icon .lucide-cpu",
      ),
    ).not.toBeNull();
    expect(button("选择模型: Current model").textContent).toBe("Current model");
    expect(button("思考等级: high").textContent).toBe("思考high");
    await render({
      instance: {
        ...instance,
        model: {
          provider: "openrouter",
          id: "claude-sonnet-4",
          name: "Sonnet",
        },
        availableModels: [],
      },
    });
    const trigger = button("选择模型: Sonnet");
    expect(trigger.disabled).toBe(true);
    expect(trigger.querySelector(".model-brand-icon title")!.textContent).toBe(
      "Claude",
    );
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
    expect(button("Select model: Current model").textContent).toBe(
      "Current model",
    );
    expect(button("Thinking level: high").textContent).toContain("Thinking");
    expect(button("Compact context").textContent).toBe("Compact");
    expect(
      container.querySelector('[aria-label="Resize input area"]') !== null,
    ).toBe(true);
  });
});
