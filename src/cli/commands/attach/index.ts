// paimon attach —— 将一个本机 + 当前目录的实例「迁移」到当前终端获得 TUI
//
// 语义：pi 不支持同一 session 文件被多进程同时写，因此 attach = 先关闭目标实例，
// 再在本地用同一 session 起一个带 TUI 的 pi。被 attach 的原实例（无论 rpc 还是 tui）
// 都会退出，这是设计本意，由用户自行负责选择目标。
// 本地新起的 pi 会重新注册到 Hub（新 pid → 新 instanceId），attach 后 Web 上依然可见。

import type { Command } from "@commander-js/extra-typings";
import { createInterface } from "node:readline/promises";
import { hostname } from "node:os";
import { realpathSync } from "node:fs";
import type { InstanceInfo } from "../../../protocol/types";
import { DEFAULTS } from "../../../protocol/types";
import { readHubState } from "../../daemon";

/** 轮询实例消失的超时（毫秒） */
const SHUTDOWN_TIMEOUT_MS = 3000;
/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 200;

/** 规范化路径用于比较（解析软链接 + 绝对化），失败则回退原值 */
function normalizePath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/** 解析 Hub 基地址：优先读 hub.json，缺失降级默认值 */
async function resolveBaseUrl(): Promise<string> {
  const state = await readHubState();
  const host =
    state?.host === "0.0.0.0" || !state?.host ? "127.0.0.1" : state.host;
  const port = state?.port ?? DEFAULTS.PORT;
  return `http://${host}:${port}`;
}

/** 探活：Hub 未运行则提示并退出 */
async function ensureHubRunning(baseUrl: string): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) return;
  } catch {
    // fall through
  }
  console.error("Hub is not running. Run 'paimon hub start' first.");
  process.exit(1);
}

/** 拉取实例列表 */
async function fetchInstances(baseUrl: string): Promise<InstanceInfo[]> {
  const res = await fetch(`${baseUrl}/api/instances`);
  if (!res.ok) {
    console.error(`Failed to fetch instances (HTTP ${res.status}).`);
    process.exit(1);
  }
  const data = (await res.json()) as { instances: InstanceInfo[] };
  return data.instances;
}

/** 交互选择：列出候选实例，读取整行数字 */
async function selectInstance(
  candidates: InstanceInfo[],
): Promise<InstanceInfo> {
  console.log("Attachable instances in the current directory:\n");
  candidates.forEach((inst, i) => {
    const sid = inst.sessionId ? inst.sessionId.slice(0, 8) : "(none)";
    console.log(
      `  ${i + 1}. instance ${inst.id.slice(0, 8)}  session ${sid}  pid=${inst.pid}`,
    );
  });
  console.log("");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const answer = (
        await rl.question(`Select [1-${candidates.length}]: `)
      ).trim();
      const n = parseInt(answer, 10);
      if (!isNaN(n) && n >= 1 && n <= candidates.length) {
        return candidates[n - 1];
      }
      console.log("Invalid selection, try again.");
    }
  } finally {
    rl.close();
  }
}

/** 确认提示（y/N） */
async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${message} (y/N) `))
      .trim()
      .toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

/** 请求 Hub 关闭目标实例 */
async function requestShutdown(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/instance/${id}/shutdown`, {
    method: "POST",
  });
  if (!res.ok) {
    console.error(`Failed to stop instance (HTTP ${res.status}).`);
    process.exit(1);
  }
}

/** 轮询直到实例从列表消失（超时报错退出） */
async function waitForInstanceGone(baseUrl: string, id: string): Promise<void> {
  const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const instances = await fetchInstances(baseUrl);
    if (!instances.some((inst) => inst.id === id)) return;
    await Bun.sleep(POLL_INTERVAL_MS);
  }
  console.error(
    `Instance did not shut down within ${SHUTDOWN_TIMEOUT_MS / 1000}s. Aborting.`,
  );
  process.exit(1);
}

/** 本地起带 TUI 的 pi，恢复同一 session */
async function spawnLocalPi(cwd: string, sessionId: string): Promise<number> {
  // 前置检测：Bun.spawn 对命令不存在不会同步抛错，需先查 PATH
  if (!Bun.which("pi")) {
    console.error("'pi' command not found in PATH.");
    process.exit(1);
  }
  const proc = Bun.spawn(["pi", "--session", sessionId], {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return await proc.exited;
}

/** attach 命令的核心逻辑 */
async function handleAttach(idPrefix: string | undefined): Promise<void> {
  const baseUrl = await resolveBaseUrl();
  await ensureHubRunning(baseUrl);

  const allInstances = await fetchInstances(baseUrl);

  // 双重过滤：本机 + 当前目录
  const localHost = hostname();
  const currentCwd = normalizePath(process.cwd());
  let candidates = allInstances.filter(
    (inst) =>
      inst.hostname === localHost && normalizePath(inst.cwd) === currentCwd,
  );

  if (candidates.length === 0) {
    console.error("No attachable instances in the current directory.");
    process.exit(1);
  }

  // 带 id 前缀：先过滤；唯一命中直接选，多命中进交互，无命中报错
  if (idPrefix) {
    const matched = candidates.filter((inst) => inst.id.startsWith(idPrefix));
    if (matched.length === 0) {
      console.error(`No instance matches id prefix '${idPrefix}'.`);
      process.exit(1);
    }
    candidates = matched;
  }

  const target =
    candidates.length === 1 ? candidates[0] : await selectInstance(candidates);

  // 无 sessionId 无法 resume，直接失败（不降级）
  if (!target.sessionId) {
    console.error("Selected instance has no session to resume. Aborting.");
    process.exit(1);
  }

  // 确认：attach 会关闭目标实例
  const ok = await confirm(
    "Attaching will stop the running instance and resume it in this terminal.\nContinue?",
  );
  if (!ok) {
    console.log("Aborted.");
    return;
  }

  // 关闭目标实例并等待其退出
  await requestShutdown(baseUrl, target.id);
  await waitForInstanceGone(baseUrl, target.id);

  // 本地接管：在原 cwd 用同一 session 起带 TUI 的 pi
  const code = await spawnLocalPi(target.cwd, target.sessionId);
  process.exit(code);
}

/** 注册 attach 命令到 program */
export function registerAttachCommand(program: Command): void {
  program
    .command("attach")
    .description("Attach a local instance to this terminal")
    .argument("[id]", "instance ID or prefix")
    .action(async (id) => {
      await handleAttach(id);
    });
}
