// 设置页面：外观（主题 + 背景）+ 语言 + 通知

import { Button } from "./ui/Button";
import { SegmentedControl } from "./ui/SegmentedControl";
import { useTranslation } from "react-i18next";
import {
  useAppearance,
  useBackground,
  useNotification,
  type Appearance,
  type Background,
} from "../stores/useSettings";
import { supportsNotification } from "../hooks/useTaskNotifier";
import { type Language, setStoredLanguage } from "../i18n";
import { MobileNavBar } from "./ui/MobileNavBar";
import { showToast } from "./ui/Toast";

// ========================================
// 通用组件
// ========================================

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
      <div className="settings-row select-none">
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
        <Button
          key={opt.value}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className="ui-background-choice"
        >
          <div
            className={`w-8 h-8 rounded-full ${value === opt.value ? "ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--panel-bg)]" : ""}`}
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
        </Button>
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
  const [notification, setNotification] = useNotification();

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
    { value: "zh-CN", label: t("settings.langZhCN") },
    { value: "en", label: t("settings.langEn") },
  ];

  const notificationOptions: { value: "on" | "off"; label: string }[] = [
    { value: "on", label: t("notification.on") },
    { value: "off", label: t("notification.off") },
  ];

  return (
    <div className="flex-1 flex items-start justify-center p-4 md:p-6 overflow-y-auto scrollbar-auto">
      <div className="settings-content">
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
              label={t("settings.theme")}
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
              label={t("settings.language")}
              options={languageOptions}
              value={i18n.language as Language}
              onChange={setStoredLanguage}
            />
          </SettingRow>
        </section>
        {/* 通知（仅在浏览器支持 Notification API 时显示） */}
        {supportsNotification && (
          <>
            <div className="text-[14px] leading-[20px] font-semibold text-[var(--label-primary)] mb-2 mt-6 px-4 select-none">
              {t("notification.title")}
            </div>
            <section className="glass-panel overflow-hidden">
              <SettingRow label={t("notification.label")} showSeparator={false}>
                <SegmentedControl
                  label={t("notification.label")}
                  options={notificationOptions}
                  value={notification ? "on" : "off"}
                  onChange={async (v) => {
                    if (v === "on") {
                      // 首次开启时请求权限
                      const permission = await Notification.requestPermission();
                      if (permission === "granted") {
                        setNotification(true);
                      } else {
                        showToast(t("notification.denied"), "warning");
                      }
                    } else {
                      setNotification(false);
                    }
                  }}
                />
              </SettingRow>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
