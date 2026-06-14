// Edge 目录浏览器：读取本地目录内容供前端路径选择
//
// 解析逻辑：
// - path 以 "/" 结尾 → parent = path, prefix = ""
// - 否则 → parent = dirname(path), prefix = basename(path)
// 过滤：仅目录，排除 "." 和 ".."，prefix 不以 "." 开头时隐藏 dotfiles

import { readdir, stat } from "node:fs/promises";
import { dirname, basename, isAbsolute } from "node:path";
import { DEFAULTS } from "../protocol/types";
import type { BrowseEntry, BrowseResult } from "../protocol/types";

/**
 * 浏览指定路径下的目录。
 * @param rawPath 用户输入的原始路径
 */
export async function browsePath(rawPath: string): Promise<BrowseResult> {
  if (!rawPath || !isAbsolute(rawPath)) {
    throw new Error("Path must be absolute");
  }

  // 解析 parent 和 prefix
  const endsWithSlash = rawPath.endsWith("/");
  const parent = endsWithSlash
    ? rawPath
    : ensureTrailingSlash(dirname(rawPath));
  const prefix = endsWithSlash ? "" : basename(rawPath);

  // 校验 parent 存在且是目录
  let st;
  try {
    st = await stat(parent);
  } catch {
    throw new Error(`Directory does not exist: ${parent}`);
  }
  if (!st.isDirectory()) {
    throw new Error(`Not a directory: ${parent}`);
  }

  // 读取目录
  let dirents;
  try {
    dirents = await readdir(parent, { withFileTypes: true });
  } catch (err) {
    throw new Error(
      `Cannot read directory: ${parent} (${(err as Error).message})`,
    );
  }

  // 判断是否显示 dotfiles：prefix 以 "." 开头时显示
  const showDotfiles = prefix.startsWith(".");

  // 过滤 + 前缀匹配
  const entries: BrowseEntry[] = [];
  for (const d of dirents) {
    // 仅目录
    if (!d.isDirectory()) continue;
    // 排除 . 和 ..
    if (d.name === "." || d.name === "..") continue;
    // dotfile 过滤
    if (!showDotfiles && d.name.startsWith(".")) continue;
    // 前缀匹配
    if (prefix && !d.name.startsWith(prefix)) continue;
    entries.push({ name: d.name });
  }

  // 排序
  entries.sort((a, b) => a.name.localeCompare(b.name));

  // 截断
  const maxEntries = DEFAULTS.BROWSE_MAX_ENTRIES;
  const truncated = entries.length > maxEntries;
  if (truncated) {
    entries.length = maxEntries;
  }

  return { parent, entries, truncated };
}

/** 确保路径以 / 结尾 */
function ensureTrailingSlash(p: string): string {
  return p.endsWith("/") ? p : p + "/";
}
