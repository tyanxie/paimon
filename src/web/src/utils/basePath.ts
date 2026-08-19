// 读取 Hub 注入的 base path（由 PAIMON_BASE_PATH 或 --base-path 决定）
// 规范化：有子路径时以 / 开头、不以 / 结尾（如 "/paimon"），根路径时为空字符串
const raw = window.__BASE_PATH__ || "/";

/** Hub 注入的部署前缀：根路径时为空字符串，子路径时如 "/paimon" */
export const BASE_PATH: string = raw === "/" ? "" : raw;

/**
 * 为路径添加 basePath 前缀。
 * @param path 以 / 开头的路径（如 "/api/instances"）
 */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
