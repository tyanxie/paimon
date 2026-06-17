// 带认证的 fetch 封装
//
// 从 localStorage 读取 token，自动附加到 Authorization header。

import { getStoredToken } from "../components/LoginPage";

/**
 * 带认证的 fetch：自动附加 Bearer token。
 * 用于前端调用 Hub HTTP API。
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
  return fetch(input, { ...init, headers });
}
