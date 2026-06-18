#!/usr/bin/env bun
// 打包脚本：从 dist/exe/ 编译产物生成可发布的 npm 包目录结构
//
// 产出：
//   dist/npm/main/              ← 主包 @tyanxie/paimon
//   dist/npm/darwin-arm64/      ← 平台包 @tyanxie/paimon-darwin-arm64
//   dist/npm/darwin-x64/        ← ...
//   dist/npm/linux-arm64/
//   dist/npm/linux-x64/
//
// 用法：
//   bun run scripts/prepare-npm-packages.ts

import { cpSync, mkdirSync, rmSync, existsSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname!, "..");
const distExeDir = join(projectRoot, "dist/exe");
const distNpmDir = join(projectRoot, "dist/npm");

// 读取根 package.json
const pkg = await Bun.file(join(projectRoot, "package.json")).json();

// 平台定义
const PLATFORMS = [
  { name: "darwin-arm64", os: "darwin", cpu: "arm64" },
  { name: "darwin-x64", os: "darwin", cpu: "x64" },
  { name: "linux-arm64", os: "linux", cpu: "arm64" },
  { name: "linux-x64", os: "linux", cpu: "x64" },
] as const;

function main(): void {
  console.log(`📦 Preparing npm packages (v${pkg.version})...\n`);

  // 校验编译产物存在
  if (!existsSync(distExeDir)) {
    console.error(
      "❌ dist/exe/ not found. Run 'bun run scripts/build-binaries.ts' first.",
    );
    process.exit(1);
  }

  // 清理输出目录
  if (existsSync(distNpmDir)) {
    rmSync(distNpmDir, { recursive: true });
  }
  mkdirSync(distNpmDir, { recursive: true });

  // 生成平台包
  console.log("📋 Platform packages:\n");
  for (const platform of PLATFORMS) {
    preparePlatformPackage(platform);
  }

  // 生成主包
  console.log("\n📋 Main package:\n");
  prepareMainPackage();

  console.log("\n✅ All packages prepared!");
  console.log(`   Output: ${distNpmDir}/`);
  console.log("\n   To publish:");
  console.log("   1. cd dist/npm/darwin-arm64 && npm publish --access public");
  console.log("   2. cd dist/npm/darwin-x64 && npm publish --access public");
  console.log("   3. cd dist/npm/linux-arm64 && npm publish --access public");
  console.log("   4. cd dist/npm/linux-x64 && npm publish --access public");
  console.log("   5. cd dist/npm/main && npm publish --access public");
}

function preparePlatformPackage(platform: {
  name: string;
  os: string;
  cpu: string;
}): void {
  const { name, os, cpu } = platform;
  const srcDir = join(distExeDir, name);

  if (!existsSync(srcDir)) {
    console.warn(`  ⚠️  Skipping ${name} (not built)`);
    return;
  }

  const outDir = join(distNpmDir, name);
  const binDir = join(outDir, "bin");

  mkdirSync(binDir, { recursive: true });

  // 拷贝二进制
  const srcBin = join(srcDir, "bin/paimon");
  const destBin = join(binDir, "paimon");
  cpSync(srcBin, destBin);
  chmodSync(destBin, 0o755);

  // 拷贝 web 目录
  const srcWeb = join(srcDir, "web");
  const destWeb = join(outDir, "web");
  cpSync(srcWeb, destWeb, { recursive: true });

  // 生成 package.json
  const platformPkg = {
    name: `${pkg.name}-${name}`,
    version: pkg.version,
    description: `Paimon binary for ${os} ${cpu}`,
    license: pkg.license,
    os: [os],
    cpu: [cpu],
    bin: { paimon: "bin/paimon" },
    files: ["bin/paimon", "web/"],
    repository: pkg.repository,
  };

  Bun.write(
    join(outDir, "package.json"),
    JSON.stringify(platformPkg, null, 2) + "\n",
  );

  console.log(`  ✓ ${pkg.name}-${name}`);
}

function prepareMainPackage(): void {
  const outDir = join(distNpmDir, "main");
  const binDir = join(outDir, "bin");
  const extDir = join(outDir, "src/extensions");

  mkdirSync(binDir, { recursive: true });
  mkdirSync(extDir, { recursive: true });

  // 拷贝启动器
  const srcLauncher = join(projectRoot, "bin/paimon.cjs");
  const destLauncher = join(binDir, "paimon.cjs");
  cpSync(srcLauncher, destLauncher);
  chmodSync(destLauncher, 0o755);

  // 拷贝 extension 源码（pi install 需要）
  const srcExt = join(projectRoot, "src/extensions/paimon");
  const destExt = join(extDir, "paimon");
  cpSync(srcExt, destExt, { recursive: true });

  // 拷贝 protocol 类型（extension 通过相对路径 ../../protocol/types 引用）
  const srcProtocol = join(projectRoot, "src/protocol");
  const destProtocol = join(outDir, "src/protocol");
  cpSync(srcProtocol, destProtocol, { recursive: true });

  // 拷贝 LICENSE 和 README
  cpSync(join(projectRoot, "LICENSE"), join(outDir, "LICENSE"));
  cpSync(join(projectRoot, "README.md"), join(outDir, "README.md"));

  // 生成 optionalDependencies
  const optionalDependencies: Record<string, string> = {};
  for (const platform of PLATFORMS) {
    optionalDependencies[`${pkg.name}-${platform.name}`] = pkg.version;
  }

  // 生成 package.json
  const mainPkg = {
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    bin: { paimon: "bin/paimon.cjs" },
    files: ["bin/", "src/extensions/", "src/protocol/", "LICENSE", "README.md"],
    repository: pkg.repository,
    homepage: pkg.homepage,
    bugs: pkg.bugs,
    keywords: pkg.keywords,
    optionalDependencies,
    pi: pkg.pi,
  };

  Bun.write(
    join(outDir, "package.json"),
    JSON.stringify(mainPkg, null, 2) + "\n",
  );

  console.log(`  ✓ ${pkg.name} (main)`);
}

main();
