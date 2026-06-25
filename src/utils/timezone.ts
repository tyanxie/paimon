// Bun 时区初始化
//
// Bun 不读系统 /etc/localtime，默认回退 UTC。
// 此模块在 daemon 入口最早位置调用，从系统配置探测时区并设置 TZ 环境变量，
// 确保后续所有 Date 操作使用正确的本地时间。

import { readFileSync, readlinkSync } from "node:fs";

/**
 * 初始化时区：探测系统时区并设置 process.env.TZ。
 * 如果用户已通过 TZ 环境变量显式指定时区，则尊重用户设置。
 */
export function initTimezone(): void {
  if (process.env.TZ) return;

  const tz = detectSystemTimezone();
  if (tz) {
    process.env.TZ = tz;
  }
}

/**
 * 从系统配置探测时区名称，返回 Bun 可识别的 IANA 时区名。
 * 探测顺序：/etc/timezone → /etc/localtime 软链接。
 * 如果系统时区名不被 Bun ICU 识别（如 Asia/Beijing），
 * 尝试从 tzdata.zi 解析别名映射到 canonical 名称。
 */
function detectSystemTimezone(): string | null {
  // 方法 1：/etc/timezone（Debian/Ubuntu）
  let tz: string | null = null;
  try {
    tz = readFileSync("/etc/timezone", "utf-8").trim();
  } catch {
    // 文件不存在，尝试下一种方法
  }

  // 方法 2：/etc/localtime 软链接（RHEL/CentOS/macOS）
  if (!tz) {
    try {
      const link = readlinkSync("/etc/localtime");
      const match = link.match(/zoneinfo\/(.+)$/);
      if (match) tz = match[1];
    } catch {
      // 非软链接或不存在
    }
  }

  if (!tz) return null;

  // 验证 Bun 是否识别该时区名
  if (isValidTimezone(tz)) return tz;

  // 不识别时，尝试从 tzdata.zi 找 canonical 名称
  const resolved = resolveTimezoneAlias(tz);
  if (resolved && isValidTimezone(resolved)) return resolved;

  // 无法解析，返回原值（可能在部分系统上仍可工作）
  return tz;
}

/**
 * 检测 Bun 是否认识指定的时区名。
 * 不被识别的时区会被 Intl 静默回退为 UTC。
 */
function isValidTimezone(tz: string): boolean {
  try {
    const resolved = new Intl.DateTimeFormat("en", {
      timeZone: tz,
    }).resolvedOptions().timeZone;
    // 不认识的时区会回退到 UTC，但 "UTC" 本身是合法的
    return resolved !== "UTC" || tz === "UTC" || tz === "Etc/UTC";
  } catch {
    return false;
  }
}

/**
 * 从 /usr/share/zoneinfo/tzdata.zi 解析 Link 记录，
 * 将非标准别名映射到 canonical IANA 名称。
 * 例如：Asia/Beijing → Asia/Shanghai
 */
function resolveTimezoneAlias(tz: string): string | null {
  try {
    const data = readFileSync("/usr/share/zoneinfo/tzdata.zi", "utf-8");
    // Link 格式：L <canonical> <alias>
    const escaped = tz.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^L\\s+(\\S+)\\s+${escaped}\\s*$`, "m");
    const match = data.match(re);
    if (match) return match[1];
  } catch {
    // tzdata.zi 不存在（某些精简系统/容器）
  }
  return null;
}
