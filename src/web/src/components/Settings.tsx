// 设置页面：外观（主题 + 背景）

import {
  useAppearance,
  useBackground,
  useMessageRenderMode,
  type Appearance,
  type Background,
  type MessageRenderMode,
} from "../stores/useSettings";
import { MobileNavBar } from "./ui/MobileNavBar";

// ========================================
// 配置选项
// ========================================

const APPEARANCE_OPTIONS: { value: Appearance; label: string }[] = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "系统" },
];

const BACKGROUND_OPTIONS: {
  value: Background;
  label: string;
  colors: string[];
}[] = [
  {
    value: "mist",
    label: "雾",
    colors: ["#e8f0fe", "#f5e6f0", "#e6f0f5", "#f0f5e6"],
  },
  {
    value: "aurora",
    label: "极光",
    colors: ["#a8d8ea", "#aa96da", "#8fd3c4", "#c4a8d8"],
  },
  {
    value: "ember",
    label: "余烬",
    colors: ["#f8d4b0", "#f0b0c0", "#f8e0a0", "#e8c0d0"],
  },
];

const DISPLAY_MODE_OPTIONS: { value: MessageRenderMode; label: string }[] = [
  { value: "rich", label: "渲染" },
  { value: "raw", label: "原始" },
];

// ========================================
// 通用组件
// ========================================

/** 分段控件 */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-[8px] bg-[var(--fill-secondary)] p-[2px]">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 rounded-[6px] text-[12px] transition-all ${
            value === opt.value
              ? "bg-[var(--panel-bg)] text-[var(--label-primary)] font-semibold shadow-sm backdrop-blur-sm"
              : "text-[var(--label-secondary)] font-normal hover:text-[var(--label-primary)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** 设置行 */
function SettingRow({
  label,
  children,
  showSeparator = true,
}: {
  label: string;
  children: React.ReactNode;
  showSeparator?: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-[13px] font-semibold text-[var(--label-primary)]">
          {label}
        </span>
        {children}
      </div>
      {showSeparator && (
        <div className="ml-4 border-b border-[var(--separator)]" />
      )}
    </>
  );
}

/** 背景选择器（色块圆圈 + 文字） */
function BackgroundPicker({
  value,
  onChange,
}: {
  value: Background;
  onChange: (v: Background) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {BACKGROUND_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="flex flex-col items-center gap-1"
        >
          <div
            className={`w-7 h-7 rounded-full transition-all ${
              value === opt.value
                ? "ring-2 ring-[var(--color-accent)] ring-offset-1"
                : "hover:scale-110"
            }`}
            style={{
              background: `conic-gradient(${opt.colors.join(", ")})`,
            }}
          />
          <span
            className={`text-[11px] ${
              value === opt.value
                ? "text-[var(--label-primary)] font-semibold"
                : "text-[var(--label-secondary)] font-normal"
            }`}
          >
            {opt.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ========================================
// 设置页面
// ========================================

export function Settings() {
  const [appearance, setAppearance] = useAppearance();
  const [background, setBackground] = useBackground();
  const [messageRenderMode, setMessageRenderMode] = useMessageRenderMode();

  return (
    <div className="flex-1 flex items-start justify-center p-4 md:p-6 overflow-y-auto scrollbar-auto">
      <div className="w-full max-w-[480px]">
        <MobileNavBar title="设置" />
        <h1 className="hidden md:block text-[22px] font-semibold text-[var(--label-primary)] mb-6 px-4">
          设置
        </h1>

        {/* 外观 */}
        <div className="text-[13px] font-semibold text-[var(--label-primary)] mb-2 px-4">
          外观
        </div>
        <section className="glass-panel overflow-hidden">
          <SettingRow label="主题">
            <SegmentedControl
              options={APPEARANCE_OPTIONS}
              value={appearance}
              onChange={setAppearance}
            />
          </SettingRow>
          <SettingRow label="背景" showSeparator={false}>
            <BackgroundPicker value={background} onChange={setBackground} />
          </SettingRow>
        </section>

        {/* 对话 */}
        <div className="text-[13px] font-semibold text-[var(--label-primary)] mb-2 px-4 mt-6">
          对话
        </div>
        <section className="glass-panel overflow-hidden">
          <SettingRow label="渲染模式" showSeparator={false}>
            <SegmentedControl
              options={DISPLAY_MODE_OPTIONS}
              value={messageRenderMode}
              onChange={setMessageRenderMode}
            />
          </SettingRow>
        </section>
      </div>
    </div>
  );
}
