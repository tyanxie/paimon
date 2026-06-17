// 带认证的 fetch 封装
//
// 从 localStorage 读取 token，自动附加到 Authorization header。
// 响应 401 时自动清除 token 并刷新页面，触发重新登录。

import { getStoredToken, clearStoredToken } from "./token";

/**
 * 带认证的 fetch：自动附加 Bearer token。
 * 用于前端调用 Hub HTTP API。
 * 响应 401 时清除本地 token 并刷新页面（回到登录页）。
 */
export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) {
    clearStoredToken();
    window.location.reload();
  }
  return response;
}
