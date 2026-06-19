// 登录页：输入 Access Token 连接 Hub
//
// macOS 26 Liquid Glass 风格：动态渐变背景 + 居中毛玻璃面板。

import { useState, useCallback, type FormEvent } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useLogoSrc } from "../hooks/useLogoSrc";
import { setStoredToken } from "../utils/token";

interface LoginPageProps {
  /** 提交 token 后的回调 */
  onLogin: (token: string) => void;
  /** 是否显示错误状态（token 验证失败） */
  error?: boolean;
}

export function LoginPage({ onLogin, error }: LoginPageProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState("");
  const logoSrc = useLogoSrc();

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const trimmed = token.trim();
      if (!trimmed) return;
      setStoredToken(trimmed);
      onLogin(trimmed);
    },
    [token, onLogin],
  );

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="glass-panel w-full max-w-[380px] p-8 flex flex-col items-center gap-6"
      >
        {/* Logo */}
        <img
          src={logoSrc}
          alt="Paimon"
          className="w-16 h-16 select-none"
          draggable={false}
        />

        {/* 标题 */}
        <div className="text-center">
          <h1 className="text-[17px] font-semibold text-[var(--label-primary)]">
            Paimon
          </h1>
          <p className="mt-1 text-[13px] text-[var(--label-secondary)]">
            {t("login.subtitle")}
          </p>
        </div>

        {/* Token 输入框 */}
        <div className="w-full">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t("login.placeholder")}
            autoFocus
            className={`w-full h-9 px-3 rounded-[9px] text-[13px] bg-[var(--fill-primary)] text-[var(--label-primary)] placeholder:text-[var(--label-tertiary)] border outline-none transition-colors ${
              error
                ? "border-red-500 focus:border-red-500"
                : "border-[var(--separator)] focus:border-[var(--color-accent)]"
            }`}
          />
          {error && (
            <p className="mt-2 text-[11px] text-red-500">
              {t("login.invalidToken")}
            </p>
          )}
        </div>

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={!token.trim()}
          className="w-full h-9 rounded-[1000px] bg-[var(--color-accent)] text-white text-[13px] font-medium transition-opacity disabled:opacity-40 hover:opacity-90 active:opacity-80"
        >
          {t("login.connect")}
        </button>

        {/* 提示 */}
        <p className="text-[11px] text-[var(--label-tertiary)] text-center leading-relaxed">
          <Trans
            i18nKey="login.tokenHint"
            components={{
              1: (
                <code className="px-1 py-0.5 rounded bg-[var(--fill-secondary)] text-[var(--label-secondary)]" />
              ),
            }}
          />
        </p>
      </form>
    </div>
  );
}
