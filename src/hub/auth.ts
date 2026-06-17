// Hub 认证工具模块
//
// 提供 access token 的生成、提取、验证、掩码显示等能力。
// 所有 token 验证使用常量时间比较防止时序攻击。

import { randomBytes, timingSafeEqual } from "node:crypto";

// ============================================================
// Token 生成
// ============================================================

/** 生成 32 字节随机 token（base64url 编码，约 43 字符） */
export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

// ============================================================
// Token 提取
// ============================================================

/**
 * 从 HTTP 请求中提取 token。
 * 支持两种方式（按优先级）：
 *   1. URL query 参数 ?token=xxx（WS 升级场景）
 *   2. Authorization: Bearer xxx（HTTP API 场景）
 */
export function extractToken(req: Request): string | null {
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);

  return null;
}

// ============================================================
// Token 验证
// ============================================================

/**
 * 验证 token 是否匹配（常量时间比较，防时序攻击）。
 * 认证关闭时始终返回 true。
 */
export function verifyAccessToken(
  provided: string | null,
  expected: string,
): boolean {
  if (!provided) return false;
  return constantTimeEquals(provided, expected);
}

/** 常量时间字符串比较 */
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  const maxLen = Math.max(bufA.length, bufB.length);
  const padA = Buffer.alloc(maxLen);
  const padB = Buffer.alloc(maxLen);
  bufA.copy(padA);
  bufB.copy(padB);
  return timingSafeEqual(padA, padB) && bufA.length === bufB.length;
}

// ============================================================
// Token 掩码
// ============================================================

/** 将 token 掩码显示（仅保留前 4 字符 + ****） */
export function maskToken(token: string): string {
  if (token.length <= 4) return "****";
  return token.slice(0, 4) + "****";
}

// ============================================================
// 认证开关
// ============================================================

/** 检查是否通过环境变量禁用认证（仅开发调试用） */
export function isAuthDisabled(): boolean {
  return process.env.PAIMON_AUTH_DISABLED === "1";
}
