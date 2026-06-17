// Access Token 本地存储工具
//
// 统一管理 localStorage 中的 token 读写。

/** localStorage key */
const TOKEN_KEY = "paimon:accessToken";

/** 读取已存储的 token */
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** 存储 token */
export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** 清除 token */
export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
