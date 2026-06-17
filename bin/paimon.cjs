#!/usr/bin/env node

// Paimon CLI 启动器
//
// npm install -g 后挂在 PATH 中，负责检测当前平台并调用对应的原生二进制。
// 平台二进制通过 optionalDependencies 安装在 @tyanxie/paimon-{platform} 包中。

"use strict";

const { execFileSync } = require("child_process");
const path = require("path");

const platform = process.platform;
const arch = process.arch;

const RELEASE_URL = "https://github.com/tyanxie/paimon/releases";
const SUPPORTED_PLATFORMS = [
  { key: "darwin-arm64", label: "macOS Apple Silicon" },
  { key: "darwin-x64", label: "macOS Intel" },
  { key: "linux-arm64", label: "Linux ARM64" },
  { key: "linux-x64", label: "Linux x64" },
];

function getPlatformKey() {
  return `${platform}-${arch}`;
}

function isSupportedPlatform() {
  return SUPPORTED_PLATFORMS.some((p) => p.key === getPlatformKey());
}

function getBinaryPath() {
  const pkgName = `@tyanxie/paimon-${getPlatformKey()}`;
  try {
    const pkgPath = require.resolve(`${pkgName}/package.json`);
    return path.join(path.dirname(pkgPath), "bin", "paimon");
  } catch {
    return null;
  }
}

function main() {
  if (!isSupportedPlatform()) {
    console.error(`Unsupported platform: ${getPlatformKey()}`);
    console.error("");
    console.error("Supported platforms:");
    for (const p of SUPPORTED_PLATFORMS) {
      console.error(`  - ${p.key} (${p.label})`);
    }
    console.error("");
    console.error("Download manually from:");
    console.error(`  ${RELEASE_URL}`);
    process.exit(1);
  }

  const binPath = getBinaryPath();
  if (!binPath) {
    const pkgName = `@tyanxie/paimon-${getPlatformKey()}`;
    console.error(`Platform package not found: ${pkgName}`);
    console.error("");
    console.error(
      "This may happen when using a registry mirror that has not synced optionalDependencies.",
    );
    console.error("");
    console.error("Try reinstalling:");
    console.error("  npm install -g @tyanxie/paimon");
    console.error("");
    console.error("Or download the binary manually from:");
    console.error(`  ${RELEASE_URL}`);
    process.exit(1);
  }

  const args = process.argv.slice(2);

  try {
    execFileSync(binPath, args, { stdio: "inherit" });
  } catch (error) {
    const status = error && typeof error.status === "number" ? error.status : null;
    const signal = error && typeof error.signal === "string" ? error.signal : null;

    if (status !== null) {
      process.exit(status);
    }

    if (signal) {
      try {
        process.kill(process.pid, signal);
      } catch {
        // 忽略不支持的信号
      }
    }

    process.exit(1);
  }
}

main();
