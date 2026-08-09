// 源码模式（bun link）的更新：git pull + bun install + bun run build

import { resolve } from "node:path";
import pkg from "../../../../package.json";
import { run, runInherit, printDaemonHints } from "./utils";

/** 获取仓库根目录（从当前文件位置推导） */
function getRepoRoot(): string {
  // 当前文件: <repo>/src/cli/commands/update/source.ts
  return resolve(import.meta.dirname!, "../../../..");
}

/** 源码模式：检查并执行更新 */
export async function updateFromSource(checkOnly: boolean): Promise<void> {
  const repoRoot = getRepoRoot();

  // 1. 检查工作目录是否干净
  const status = await run(["git", "status", "--porcelain"], { cwd: repoRoot });
  if (!status.ok) {
    console.error("Failed to check git status");
    process.exit(1);
  }
  if (status.stdout) {
    console.error("Working directory has uncommitted changes:");
    console.error(status.stdout);
    console.error("\nPlease commit or stash changes before updating.");
    process.exit(1);
  }

  // 2. fetch 远端
  console.log("Fetching updates...");
  const fetchResult = await run(["git", "fetch"], { cwd: repoRoot });
  if (!fetchResult.ok) {
    console.error("Failed to fetch remote:", fetchResult.stderr);
    process.exit(1);
  }

  // 3. 比较本地与远端 HEAD
  const [localResult, remoteResult] = await Promise.all([
    run(["git", "rev-parse", "HEAD"], { cwd: repoRoot }),
    run(["git", "rev-parse", "@{upstream}"], { cwd: repoRoot }),
  ]);

  if (!localResult.ok || !remoteResult.ok) {
    console.error("Failed to compare local and remote HEAD");
    process.exit(1);
  }

  const localHash = localResult.stdout;
  const remoteHash = remoteResult.stdout;

  if (localHash === remoteHash) {
    console.log(
      `Already up to date (v${pkg.version}, ${localHash.slice(0, 7)})`,
    );
    return;
  }

  // 检查是否可以 fast-forward（远端领先本地）
  const ancestor = await run(
    ["git", "merge-base", "--is-ancestor", "HEAD", "@{upstream}"],
    { cwd: repoRoot },
  );
  if (!ancestor.ok) {
    console.error(
      "Local branch has diverged from upstream (local commits not pushed).",
    );
    console.error("Please push or reset your changes before updating.");
    process.exit(1);
  }

  // 显示远端版本信息
  const remoteVersionResult = await run(
    ["git", "show", `${remoteHash}:package.json`],
    { cwd: repoRoot },
  );
  const remoteVersion = remoteVersionResult.ok
    ? (JSON.parse(remoteVersionResult.stdout) as { version: string }).version
    : "unknown";

  console.log(
    `Current: v${pkg.version} (${localHash.slice(0, 7)}) → Remote: v${remoteVersion} (${remoteHash.slice(0, 7)})`,
  );

  if (checkOnly) return;

  // 4. 执行更新
  console.log("\nPulling changes...");
  if (!(await runInherit(["git", "pull"], { cwd: repoRoot }))) {
    console.error("git pull failed");
    process.exit(1);
  }

  console.log("\nInstalling dependencies...");
  if (!(await runInherit(["bun", "install"], { cwd: repoRoot }))) {
    console.error("bun install failed");
    process.exit(1);
  }

  console.log("\nBuilding web UI...");
  if (!(await runInherit(["bun", "run", "build"], { cwd: repoRoot }))) {
    console.error("bun run build failed");
    process.exit(1);
  }

  console.log(`\n✅ Updated to v${remoteVersion} (${remoteHash.slice(0, 7)})`);
  await printDaemonHints();
}
