// i18n 初始化：i18next + react-i18next
//
// 使用 flat namespace 方案：所有 key 按模块分组存储在单一 namespace "translation" 下。
// fallback 语言为中文（zh），确保缺失翻译时不会白屏。

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "./locales/zh";
import en from "./locales/en";

export type Language = "zh" | "en";

const STORAGE_KEY = "paimon:language";

/** 从 localStorage 读取语言偏好 */
export function getStoredLanguage(): Language {
  const val = localStorage.getItem(STORAGE_KEY);
  if (val === "zh" || val === "en") return val;
  return "zh";
}

/** 持久化语言偏好 */
export function setStoredLanguage(lang: Language) {
  localStorage.setItem(STORAGE_KEY, lang);
  i18n.changeLanguage(lang);
}

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: getStoredLanguage(),
  fallbackLng: "zh",
  interpolation: {
    escapeValue: false, // React 已自带 XSS 防护
  },
});

export default i18n;
