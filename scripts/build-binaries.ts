#!/usr/bin/env bun
// 构建脚本：先打包前端产物，再为各平台编译 paimon 二进制
//
// 用法：
//   bun run scripts/build-binaries.ts          # 编译所有平台
//   bun run scripts/build-binaries.ts --local  # 仅编译当前平台（开发调试用）

import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname!, "..");
const distExeDir = join(projectRoot, "dist/exe");
const distWebDir = join(projectRoot, "dist/web");
const entrypoint = join(projectRoot, "src/cli/index.ts");

// 支持的目标平台
const PLATFORMS = [
  { target: "bun-darwin-arm64", name: "darwin-arm64" },
  { target: "bun-darwin-x64", name: "darwin-x64" },
  { target: "bun-linux-arm64", name: "linux-arm64" },
  { target: "bun-linux-x64", name: "linux-x64" },
] as const;

// 解析参数
const localOnly = process.argv.includes("--local");

function run(cmd: string): void {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: projectRoot, stdio: "inherit" });
}

function getCurrentTarget(): string {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `bun-${os}-${arch}`;
}

async function main(): Promise<void> {
  console.log("🔨 Building paimon binaries...\n");

  // 步骤 1：构建前端
  console.log("📦 Step 1: Building frontend (vite)...");
  run("bun run build");

  if (!existsSync(distWebDir)) {
    console.error("❌ dist/web/ not found after vite build");
    process.exit(1);
  }

  // 步骤 2：清理并创建输出目录
  console.log("\n🗑️  Step 2: Preparing output directory...");
  if (existsSync(distExeDir)) {
    rmSync(distExeDir, { recursive: true });
  }
  mkdirSync(distExeDir, { recursive: true });

  // 步骤 3：编译各平台
  const targets = localOnly
    ? PLATFORMS.filter((p) => p.target === getCurrentTarget())
    : PLATFORMS;

  if (targets.length === 0) {
    console.error(
      `❌ No matching platform for current system: ${getCurrentTarget()}`,
    );
    process.exit(1);
  }

  console.log(`\n🏗️  Step 3: Compiling for ${targets.length} platform(s)...\n`);

  for (const { target, name } of targets) {
    const platformDir = join(distExeDir, name);
    const outfile = join(platformDir, "paimon");

    mkdirSync(platformDir, { recursive: true });

    console.log(`  ▸ ${name} (${target})`);
    run(
      `bun build --compile --target=${target} ${entrypoint} --outfile ${outfile}`,
    );

    // 拷贝 web 产物到平台目录
    const webDest = join(platformDir, "web");
    cpSync(distWebDir, webDest, { recursive: true });
  }

  // 完成
  console.log("\n✅ Build complete!");
  console.log(`   Output: ${distExeDir}/`);
  for (const { name } of targets) {
    console.log(`   - ${name}/paimon`);
    console.log(`   - ${name}/web/`);
  }
}

main().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
