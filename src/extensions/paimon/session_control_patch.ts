/**
 * Session Control Patch — pi.runWhenIdle() 的 userland polyfill
 *
 * ## 背景
 * pi SDK 的 session 控制方法（newSession / switchSession）只存在于
 * ExtensionCommandContext 中，而该 context 只有 command handler 才能获得。
 * Extension 的事件 handler 和外部消息处理中无法触发 session 切换。
 * 这是 pi SDK 的已知限制，上游 issue: https://github.com/anthropics/pi/issues/2023
 *
 * ## 原理
 * 参考 https://github.com/tshu-w/pi-control 的实现方案：
 * 1. Monkey-patch ExtensionRunner.prototype.bindCommandContext
 *    — pi 在 runtime 初始化时调用此方法，传入 session 控制函数（newSession/switchSession 等）
 *    — 我们拦截这次调用，将这些函数引用保存下来
 * 2. 当 Hub 消息到达时，将操作存入 pending queue
 * 3. 通过 setTimeout(0) 在当前事件循环结束后执行（此时 agent 已 idle）
 *
 * ## 替换计划
 * 当 pi 官方提供 pi.runWhenIdle() API 后，本文件可整体替换为对官方 API 的简单调用。
 *
 * ## 兼容性
 * 依赖 ExtensionRunner 从 @earendil-works/pi-coding-agent 公开导出，
 * 以及 bindCommandContext 方法签名不变。如 patch 失败，session 切换功能降级为不可用。
 */

import { ExtensionRunner } from "@earendil-works/pi-coding-agent";

// ─── 内部状态 ─────────────────────────────────────────────────

interface SessionOps {
  newSession: (options?: any) => Promise<{ cancelled: boolean }>;
  switchSession: (
    path: string,
    options?: any,
  ) => Promise<{ cancelled: boolean }>;
}

type PendingAction = { type: "new" } | { type: "switch"; path: string };

let _ops: SessionOps | null = null;
let _pending: PendingAction | null = null;
let _patched = false;

// ─── 对外 API ─────────────────────────────────────────────────

/** 安装 patch。应在 extension 加载时调用一次。返回是否成功。 */
export function install(): boolean {
  if (_patched) return true;
  try {
    const orig = ExtensionRunner.prototype.bindCommandContext;
    if (typeof orig !== "function") return false;

    ExtensionRunner.prototype.bindCommandContext = function (actions: any) {
      _ops = actions
        ? {
            newSession: actions.newSession,
            switchSession: actions.switchSession,
          }
        : null;
      return orig.call(this, actions);
    };

    _patched = true;
    return true;
  } catch {
    return false;
  }
}

/** patch 是否成功且已捕获到 ops */
export function isReady(): boolean {
  return _ops !== null;
}

/** 排队：新建 session。立即尝试执行。 */
export function scheduleNew(): boolean {
  if (!_ops || _pending) return false;
  _pending = { type: "new" };
  setTimeout(flush, 0);
  return true;
}

/** 排队：切换 session。立即尝试执行。 */
export function scheduleSwitch(path: string): boolean {
  if (!_ops || _pending) return false;
  _pending = { type: "switch", path };
  setTimeout(flush, 0);
  return true;
}

/** 尝试执行 pending action。可在 agent_end 中作为安全网调用。 */
export function flush(): void {
  if (!_ops || !_pending) return;
  const action = _pending;
  _pending = null;

  const ops = _ops;
  if (action.type === "new") {
    ops.newSession().catch(console.error);
  } else {
    ops.switchSession(action.path).catch(console.error);
  }
}

/** 清理 pending 状态。在 session_shutdown 时调用。 */
export function clear(): void {
  _pending = null;
}
