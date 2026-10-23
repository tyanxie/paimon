import { lazy, Suspense } from "react";
import { Cpu } from "lucide-react";
import OpenAI from "@lobehub/icons/es/OpenAI/components/Mono.js";
import Claude from "@lobehub/icons/es/Claude/components/Color.js";
import Gemini from "@lobehub/icons/es/Gemini/components/Color.js";
import Moonshot from "@lobehub/icons/es/Moonshot/components/Mono.js";
import Qwen from "@lobehub/icons/es/Qwen/components/Color.js";
import ZAI from "@lobehub/icons/es/ZAI/components/Mono.js";
import Grok from "@lobehub/icons/es/Grok/components/Mono.js";
import DeepSeek from "@lobehub/icons/es/DeepSeek/components/Color.js";
import Minimax from "@lobehub/icons/es/Minimax/components/Color.js";
import Hunyuan from "@lobehub/icons/es/Hunyuan/components/Color.js";

interface ModelBrandIconProps {
  model: string;
  size?: number;
}

interface ModelMapping {
  Icon?: typeof OpenAI;
  keywords: string[];
  props?: { type: string };
}

// 匹配规则复制自 @lobehub/icons 6.4.0 的 src/features/modelConfig.ts：
// https://raw.githubusercontent.com/lobehub/lobe-icons/v6.4.0/src/features/modelConfig.ts
// 新增常用规则时，复制对应的 keywords 与 props，保留原有匹配顺序，并静态导入对应图标。
// 图标优先使用 Color 版本，未提供 Color 时使用 Mono；升级依赖时核对规则。
// 未提供 Icon 的条目交给完整匹配组件，保留具体模型的优先级。
const commonModelMappings: ModelMapping[] = [
  { Icon: OpenAI, keywords: ["gpt-3"], props: { type: "gpt3" } },
  { Icon: OpenAI, keywords: ["gpt-4"], props: { type: "gpt4" } },
  { Icon: OpenAI, keywords: ["gpt-5"], props: { type: "gpt5" } },
  { keywords: ["sora"] },
  { Icon: OpenAI, keywords: ["gpt-oss"], props: { type: "oss" } },
  {
    Icon: OpenAI,
    keywords: ["o1-", "^o1", "/o1", "o3-", "^o3", "/o3", "o4-", "^o4", "/o4"],
    props: { type: "o1" },
  },
  { keywords: ["dalle", "dall-e"] },
  {
    Icon: OpenAI,
    keywords: [
      "text-embedding-",
      "tts-",
      "whisper-",
      "codex",
      "davinci",
      "babbage",
      "omni-moderation",
      "text-moderation",
      "text-adb",
      "text-ada",
      "computer-use",
    ],
    props: { type: "platform" },
  },
  { Icon: OpenAI, keywords: ["^gpt-", "/gpt-", "openai"] },
  { keywords: ["^glm-(.*)v", "/glm-(.*)v", "-glm-(.*)v"] },
  {
    Icon: ZAI,
    keywords: [
      "^glm-5",
      "/glm-5",
      "/glm5",
      "-glm-4",
      "^glm-4",
      "/glm-4",
      "/glm4",
      "-glm-5",
    ],
  },
  { Icon: Claude, keywords: ["claude"] },
  {
    keywords: [
      "gemini-3.1-flash-image-preview",
      "gemini-3-pro-image-preview",
      "gemini-\\d+(?:\\.\\d+)?-(?:flash(?:-lite)?|pro)-image(?:-preview)?(?::|$)",
      "nanobanana",
      "nano-banana",
    ],
  },
  { Icon: Gemini, keywords: ["gemini"] },
  { Icon: Moonshot, keywords: ["kimi", "moonshot"] },
  {
    Icon: Qwen,
    keywords: [
      "qwen",
      "qwq",
      "qvq",
      "wanx",
      "wan\\d/",
      "wan\\d\\.\\d-",
      "tongyi",
      "gte-rerank",
    ],
  },
  { Icon: Minimax, keywords: ["minimax", "abab", "^image-"] },
  { Icon: Hunyuan, keywords: ["hunyuan", "hy3", "hy4"] },
  { Icon: Grok, keywords: ["^grok-", "/grok-"] },
  { Icon: DeepSeek, keywords: ["deepseek"] },
];

const commonModelMatchers = commonModelMappings.map((mapping) => ({
  ...mapping,
  patterns: mapping.keywords.map((keyword) => new RegExp(keyword, "i")),
}));

const FullModelIcon = lazy(async () => {
  try {
    const [{ default: ModelIcon }, { modelMappings }] = await Promise.all([
      import("@lobehub/icons/es/features/ModelIcon"),
      import("@lobehub/icons/es/features/modelConfig"),
    ]);
    const patterns = modelMappings.flatMap(({ keywords }) =>
      keywords.map((keyword) => new RegExp(keyword, "i")),
    );
    return {
      default: ({ model, size }: ModelBrandIconProps) =>
        patterns.some((pattern) => pattern.test(model.toLowerCase())) ? (
          <ModelIcon model={model} type="color" size={size} />
        ) : (
          <Cpu size={size} />
        ),
    };
  } catch {
    return {
      default: ({ size }: ModelBrandIconProps) => <Cpu size={size} />,
    };
  }
});

export function ModelBrandIcon({ model, size = 14 }: ModelBrandIconProps) {
  const normalizedModel = model.toLowerCase();
  const match = commonModelMatchers.find(({ patterns }) =>
    patterns.some((pattern) => pattern.test(normalizedModel)),
  );
  const Icon = match?.Icon;
  return (
    <span
      aria-hidden="true"
      className="model-brand-icon"
      style={{ width: size, height: size }}
    >
      {Icon ? (
        <Icon size={size} {...match.props} />
      ) : (
        <Suspense fallback={null}>
          <FullModelIcon model={model} size={size} />
        </Suspense>
      )}
    </span>
  );
}
