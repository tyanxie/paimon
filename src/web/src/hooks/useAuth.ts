// 认证状态管理

import { useCallback, useState } from "react";
import { getStoredToken, clearStoredToken } from "../utils/token";

export function useAuth() {
  const [authToken, setAuthToken] = useState<string | null>(getStoredToken());
  const [authError, setAuthError] = useState(false);

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

  return { authToken, authError, handleLogin, handleAuthError };
}
