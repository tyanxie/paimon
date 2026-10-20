// 登录页：输入 Access Token 连接 Hub
//
// macOS 26 Liquid Glass 风格：动态渐变背景 + 居中毛玻璃面板。

import { useState, useCallback, useId, type FormEvent } from "react";
import { Button } from "./ui/Button";
import { FormField, TextField } from "./ui/FormControls";
import { StatusMessage } from "./ui/StatusMessage";
import { useTranslation, Trans } from "react-i18next";
import { useLogoSrc } from "../hooks/useLogoSrc";
import { setStoredToken } from "../utils/token";
import { withBasePath } from "../utils/basePath";

interface LoginPageProps {
  /** 提交 token 后的回调 */
  onLogin: (token: string) => void;
  /** 是否显示错误状态（token 验证失败） */
  error?: boolean;
}

export function LoginPage({ onLogin, error }: LoginPageProps) {
  const { t } = useTranslation();
  const tokenId = useId();
  const errorId = useId();
  const [token, setToken] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(false);
  const logoSrc = useLogoSrc();

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = token.trim();
      if (!trimmed || verifying) return;

      setVerifying(true);
      setVerifyError(false);

      try {
        const res = await fetch(withBasePath("/api/instances"), {
          headers: { Authorization: `Bearer ${trimmed}` },
        });
        if (res.status === 401) {
          setVerifyError(true);
          setVerifying(false);
          return;
        }
      } catch {
        // 网络错误时仍允许登录，让 WS 层处理重连
      }

      setVerifying(false);
      setStoredToken(trimmed);
      onLogin(trimmed);
    },
    [token, verifying, onLogin],
  );

  return (
    <div className="fixed-viewport flex items-center justify-center p-4 overflow-y-auto">
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
        <FormField label={t("login.placeholder")} htmlFor={tokenId}>
          <TextField
            id={tokenId}
            aria-describedby={error || verifyError ? errorId : undefined}
            invalid={error || verifyError}
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t("login.placeholder")}
            autoFocus
            disabled={verifying}
            autoComplete="off"
          />
          {(error || verifyError) && (
            <div id={errorId}>
              <StatusMessage compact tone="error">
                {t("login.invalidToken")}
              </StatusMessage>
            </div>
          )}
        </FormField>

        {/* 提交按钮 */}
        <Button
          variant="primary"
          loading={verifying}
          type="submit"
          disabled={!token.trim() || verifying}
          className="w-full"
        >
          {verifying ? t("login.verifying") : t("login.connect")}
        </Button>

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
