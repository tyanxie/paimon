/**
 * Compaction Abort Patch — 截获 AgentSession 实例以调用 abortCompaction()
 *
 * ## 背景
 * pi SDK 的 Extension API 只暴露了通用的 `ctx.abort()`（中止 agent streaming），
 * 而上下文压缩使用独立的 `session.abortCompaction()` 方法取消。
 * Extension context 未暴露该方法，导致 paimon 无法在 compact 期间提供终止能力。
 *
 * ## 原理
 * Monkey-patch `AgentSession.prototype.compact`：
 * 1. compact 被调用时保存 `this`（AgentSession 实例）引用
 * 2. compact 结束后清除引用
 * 3. 外部调用 `abortCompaction()` 时，转发到保存的 session 实例
 *
 * ## 兼容性
 * 依赖 `AgentSession` 从 `@earendil-works/pi-coding-agent` 公开导出，
 * 以及 `compact` / `abortCompaction` 方法签名不变。
 * 如 patch 失败，compact 取消功能降级为不可用（不影响其他功能）。
 */

import { AgentSession } from "@earendil-works/pi-coding-agent";

// ─── 内部状态 ─────────────────────────────────────────────────

let _session: any = null;
let _patched = false;

// ─── 对外 API ─────────────────────────────────────────────────

/** 安装 patch。应在 extension 加载时调用一次。返回是否成功。 */
export function install(): boolean {
  if (_patched) return true;
  try {
    const proto = AgentSession.prototype as any;
    const origCompact = proto.compact;
    if (typeof origCompact !== "function") return false;

    proto.compact = async function (...args: any[]) {
      _session = this;
      try {
        return await origCompact.apply(this, args);
      } finally {
        _session = null;
      }
    };

    _patched = true;
    return true;
  } catch {
    return false;
  }
}

/** 尝试终止正在进行的 compaction。返回是否成功调用。 */
export function abortCompaction(): boolean {
  if (_session && typeof _session.abortCompaction === "function") {
    _session.abortCompaction();
    return true;
  }
  return false;
}
