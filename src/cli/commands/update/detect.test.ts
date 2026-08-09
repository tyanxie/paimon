import { describe, expect, test } from "bun:test";
import {
  detectGlobalInstall,
  buildUpdateCommand,
  type KnownGlobalDirs,
} from "./detect";

const HOME = "/home/u";

const dirs: KnownGlobalDirs = {
  pnpmGlobalRoot: `${HOME}/.local/share/pnpm/global`,
  pnpmPackages: `${HOME}/.local/share/pnpm/global/5/node_modules`,
  pnpmPrefix: `${HOME}/.local/share/pnpm`,
  yarnPackages: `${HOME}/.config/yarn/global/node_modules`,
  yarnPrefix: "/usr/local",
  bunPrefix: `${HOME}/.bun`,
};

/** 平台包内二进制的相对路径 */
const BIN = "@tyanxie/paimon-linux-x64/bin/paimon";

describe("detectGlobalInstall", () => {
  test("npm via nvm", () => {
    const prefix = `${HOME}/.nvm/versions/node/v23.8.0`;
    expect(
      detectGlobalInstall(`${prefix}/lib/node_modules/${BIN}`, dirs),
    ).toEqual({
      agent: "npm",
      prefix,
      packagesDir: `${prefix}/lib/node_modules`,
    });
  });

  test("npm via homebrew", () => {
    expect(
      detectGlobalInstall(`/opt/homebrew/lib/node_modules/${BIN}`, dirs),
    ).toEqual({
      agent: "npm",
      prefix: "/opt/homebrew",
      packagesDir: "/opt/homebrew/lib/node_modules",
    });
  });

  test("bun global", () => {
    expect(
      detectGlobalInstall(
        `${HOME}/.bun/install/global/node_modules/${BIN}`,
        dirs,
      ),
    ).toEqual({
      agent: "bun",
      prefix: `${HOME}/.bun`,
      packagesDir: `${HOME}/.bun/install/global/node_modules`,
    });
  });

  test("bun global with custom BUN_INSTALL", () => {
    const result = detectGlobalInstall(
      `/opt/bun/install/global/node_modules/${BIN}`,
      dirs,
    );
    expect(result?.agent).toBe("bun");
    expect(result?.prefix).toBe("/opt/bun");
  });

  // pnpm 的实包放在与 node_modules 同级的 .pnpm 虚拟目录下（实测 pnpm 10 布局），
  // 从二进制向上找到的 node_modules 并非全局安装目录，只能靠全局根目录判定
  test("pnpm global via .pnpm virtual store", () => {
    const path = `${dirs.pnpmGlobalRoot}/5/.pnpm/@tyanxie+paimon-linux-x64@1.4.0/node_modules/${BIN}`;
    expect(detectGlobalInstall(path, dirs)).toEqual({
      agent: "pnpm",
      prefix: dirs.pnpmPrefix,
      packagesDir: dirs.pnpmPackages,
    });
  });

  // 目录版本号未来可能从 5 变化，判定不应依赖它
  test("pnpm global is version-number agnostic", () => {
    const path = `${dirs.pnpmGlobalRoot}/6/.pnpm/@tyanxie+paimon-linux-x64@2.0.0/node_modules/${BIN}`;
    expect(detectGlobalInstall(path, dirs)?.agent).toBe("pnpm");
  });

  test("yarn classic global", () => {
    expect(detectGlobalInstall(`${dirs.yarnPackages}/${BIN}`, dirs)).toEqual({
      agent: "yarn",
      prefix: "/usr/local",
      packagesDir: dirs.yarnPackages,
    });
  });

  test("returns null for non-global paths", () => {
    expect(detectGlobalInstall(`${HOME}/proj/paimon/bin/paimon`, dirs)).toBe(
      null,
    );
    // 项目本地 node_modules 不属于任何全局目录形态
    expect(
      detectGlobalInstall(`${HOME}/proj/paimon/node_modules/${BIN}`, dirs),
    ).toBe(null);
  });
});

describe("buildUpdateCommand", () => {
  const spec = "@tyanxie/paimon@1.5.0";

  test("npm appends explicit prefix", () => {
    const result = buildUpdateCommand(
      { agent: "npm", prefix: "/opt/homebrew", packagesDir: "" },
      spec,
    );
    expect(result).toEqual({
      cmd: ["npm", "i", "-g", spec, "--prefix", "/opt/homebrew"],
      env: {},
    });
  });

  test("yarn appends explicit prefix", () => {
    const result = buildUpdateCommand(
      { agent: "yarn", prefix: "/usr/local", packagesDir: "" },
      spec,
    );
    expect(result?.cmd).toEqual([
      "yarn",
      "global",
      "add",
      spec,
      "--prefix",
      "/usr/local",
    ]);
    expect(result?.env).toEqual({});
  });

  test("pnpm passes prefix via PNPM_HOME", () => {
    const result = buildUpdateCommand(
      { agent: "pnpm", prefix: "/pnpm-home", packagesDir: "" },
      spec,
    );
    expect(result).toEqual({
      cmd: ["pnpm", "add", "-g", spec],
      env: { PNPM_HOME: "/pnpm-home" },
    });
  });

  test("bun passes prefix via BUN_INSTALL", () => {
    const result = buildUpdateCommand(
      { agent: "bun", prefix: "/home/u/.bun", packagesDir: "" },
      spec,
    );
    expect(result).toEqual({
      cmd: ["bun", "add", "-g", spec],
      env: { BUN_INSTALL: "/home/u/.bun" },
    });
  });
});
