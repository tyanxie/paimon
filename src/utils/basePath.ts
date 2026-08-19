// basePath 规范化工具，Hub 和 CLI 共用

const VALID_BASE_PATH_RE = /^[a-zA-Z0-9/_-]+$/;

/**
 * 规范化 basePath：
 * - 空字符串或 "/" 视为无子路径（返回 undefined）
 * - 以 / 开头、不以 / 结尾（如 "/paimon"）
 * - 仅允许 [a-zA-Z0-9/_-] 字符，不合法则抛出错误
 */
export function normalizeBasePath(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "/") return undefined;

  // 规范化：去除多余斜杠，确保以 / 开头
  const normalized = "/" + trimmed.split("/").filter(Boolean).join("/");
  if (normalized === "/") return undefined;

  // 白名单校验
  if (!VALID_BASE_PATH_RE.test(normalized)) {
    throw new Error(
      `Invalid base path "${raw}": only [a-zA-Z0-9/_-] characters are allowed`,
    );
  }

  return normalized;
}
