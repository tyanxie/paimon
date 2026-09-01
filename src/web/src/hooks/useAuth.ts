// 认证状态管理
//
// 初始化时如果 localStorage 无 token，尝试通过 /api/token 获取（支持反向代理注入认证的场景）。
// 获取成功则自动存入 localStorage；失败则展示登录页。

import { useCallback, useEffect, useState } from "react";
import {
  getStoredToken,
  setStoredToken,
  clearStoredToken,
} from "../utils/token";
import { withBasePath } from "../utils/basePath";

export function useAuth() {
  const [authToken, setAuthToken] = useState<string | null>(getStoredToken());
  const [authError, setAuthError] = useState(false);
  const [probing, setProbing] = useState(() => getStoredToken() === null);

  // 初始化时尝试从 /api/token 获取 token（代理认证场景）
  useEffect(() => {
    if (!probing) return;

    let cancelled = false;

    const probe = async () => {
      try {
        const res = await fetch(withBasePath("/api/token"), {
          signal: AbortSignal.timeout(3000),
        });
        if (cancelled) return;
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const token = data.token as string;
        setStoredToken(token);
        setAuthToken(token);
      } catch {
        // 超时或网络错误，回退到手动输入
      } finally {
        if (!cancelled) setProbing(false);
      }
    };

    probe();

    return () => {
      cancelled = true;
    };
  }, [probing]);

  const handleLogin = useCallback((token: string) => {
    setAuthError(false);
    setAuthToken(token);
  }, []);

  const handleAuthError = useCallback(() => {
    // token 无效，清除并回到登录页
    clearStoredToken();
    setAuthToken(null);
    setAuthError(true);
  }, []);

  return { authToken, authError, probing, handleLogin, handleAuthError };
}
