// 设置页面：外观（主题 + 背景）+ 语言

import { useTranslation } from "react-i18next";
import {
  useAppearance,
  useBackground,
  type Appearance,
  type Background,
} from "../stores/useSettings";
import { type Language, setStoredLanguage } from "../i18n";
import { MobileNavBar } from "./ui/MobileNavBar";

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
    <div className="flex rounded-[8px] bg-[var(--fill-secondary)] p-[2px] select-none">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-[6px] text-[13px] leading-[18px] transition-all ${
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
      <div className="flex items-center justify-between px-4 py-3 select-none">
        <span className="text-[14px] leading-[20px] font-semibold text-[var(--label-primary)]">
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
  options,
}: {
  value: Background;
  onChange: (v: Background) => void;
  options: { value: Background; label: string; colors: string[] }[];
}) {
  return (
    <div className="flex items-center gap-3 select-none">
      {options.map((opt) => (
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
            className={`text-[12px] leading-[16px] ${
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
  const { t, i18n } = useTranslation();
  const [appearance, setAppearance] = useAppearance();
  const [background, setBackground] = useBackground();

  const appearanceOptions: { value: Appearance; label: string }[] = [
    { value: "light", label: t("settings.themeLight") },
    { value: "dark", label: t("settings.themeDark") },
    { value: "system", label: t("settings.themeSystem") },
  ];

  const backgroundOptions: {
    value: Background;
    label: string;
    colors: string[];
  }[] = [
    {
      value: "mist",
      label: t("settings.bgMist"),
      colors: ["#e8f0fe", "#f5e6f0", "#e6f0f5", "#f0f5e6"],
    },
    {
      value: "aurora",
      label: t("settings.bgAurora"),
      colors: ["#a8d8ea", "#aa96da", "#8fd3c4", "#c4a8d8"],
    },
    {
      value: "ember",
      label: t("settings.bgEmber"),
      colors: ["#f8d4b0", "#f0b0c0", "#f8e0a0", "#e8c0d0"],
    },
  ];

  const languageOptions: { value: Language; label: string }[] = [
    { value: "zh", label: t("settings.langZh") },
    { value: "en", label: t("settings.langEn") },
  ];

  return (
    <div className="flex-1 flex items-start justify-center p-4 md:p-6 overflow-y-auto scrollbar-auto">
      <div className="w-full max-w-[480px]">
        <MobileNavBar title={t("settings.title")} />
        <h1 className="hidden md:block text-[22px] font-semibold text-[var(--label-primary)] mb-6 px-4 select-none">
          {t("settings.title")}
        </h1>

        {/* 外观 */}
        <div className="text-[14px] leading-[20px] font-semibold text-[var(--label-primary)] mb-2 px-4 select-none">
          {t("settings.appearance")}
        </div>
        <section className="glass-panel overflow-hidden">
          <SettingRow label={t("settings.theme")}>
            <SegmentedControl
              options={appearanceOptions}
              value={appearance}
              onChange={setAppearance}
            />
          </SettingRow>
          <SettingRow label={t("settings.background")} showSeparator={false}>
            <BackgroundPicker
              value={background}
              onChange={setBackground}
              options={backgroundOptions}
            />
          </SettingRow>
        </section>

        {/* 语言 */}
        <div className="text-[14px] leading-[20px] font-semibold text-[var(--label-primary)] mb-2 mt-6 px-4 select-none">
          {t("settings.language")}
        </div>
        <section className="glass-panel overflow-hidden">
          <SettingRow label={t("settings.language")} showSeparator={false}>
            <SegmentedControl
              options={languageOptions}
              value={i18n.language as Language}
              onChange={setStoredLanguage}
            />
          </SettingRow>
        </section>
      </div>
    </div>
  );
}
