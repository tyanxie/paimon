import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import type { EdgeState, HubState } from "../protocol/types";
import { isLoopbackHost, nonLoopbackWarning } from "../utils/env";

const root = resolve(import.meta.dir, "../../.test-artifacts/edge-token");
const isolatedHome = process.env.PAIMON_EDGE_TOKEN_TEST_HOME;

if (!isolatedHome) {
  // module mock 只在子进程生效，避免影响其他用例的状态目录和进程操作
  test("Edge token 用例在独立目录与子进程中通过", async () => {
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(join(root, "run-"));
    try {
      const child = Bun.spawn([process.execPath, "test", import.meta.path], {
        env: {
          ...process.env,
          HOME: directory,
          TMPDIR: directory,
          TMP: directory,
          TEMP: directory,
          PAIMON_EDGE_TOKEN_TEST_HOME: directory,
          PAIMON_ACCESS_TOKEN: "",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(exitCode, stdout + stderr).toBe(0);
      expect(await readdir(directory)).not.toContain(".paimon");
    } finally {
      await rm(directory, { recursive: true, force: true });
      for (const path of [root, resolve(root, "..")]) {
        try {
          await rmdir(path);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !("code" in error) ||
            (error.code !== "ENOENT" && error.code !== "ENOTEMPTY")
          )
            throw error;
        }
      }
    }
    expect(await stat(directory).catch(() => null)).toBeNull();
  }, 60_000);
} else {
  if (
    !isolatedHome.startsWith(root + "/run-") ||
    process.env.HOME !== isolatedHome
  ) {
    throw new Error("Edge token tests require an isolated test directory");
  }
  const stateDir = join(isolatedHome, ".paimon");
  mock.module("../utils/env", () => ({
    STATE_DIR: stateDir,
    isCompiled: false,
    isLoopbackHost,
    nonLoopbackWarning,
  }));
  const { startEdgeDaemon, readEdgeState, stopEdgeDaemon } =
    await import("./edge-daemon");
  const { handleEdgeRestart } = await import("./commands/edge/restart");
  const { handleEdgeStatus } = await import("./commands/edge/status");
  const edgePath = join(stateDir, "edge.json");
  const hubPath = join(stateDir, "hub.json");
  const oldPid = 987650;
  const newPid = 987651;
  const previous: EdgeState = {
    pid: oldPid,
    port: 9090,
    host: "127.0.0.1",
    edgeId: "test-edge",
    hubUrl: "ws://127.0.0.1:8080",
    accessToken: "previous-token",
    startedAt: "2026-01-01T00:00:00.000Z",
  };
  const hub: HubState = {
    pid: 987652,
    port: 8080,
    host: "127.0.0.1",
    accessToken: "local-hub-token",
    startedAt: previous.startedAt,
  };
  let alive: boolean;
  let spawnedEnv: Record<string, string | undefined> | undefined;
  let spawn: ReturnType<typeof spyOn<typeof Bun, "spawn">>;
  let kill: ReturnType<typeof spyOn<typeof process, "kill">>;
  let health: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
  let log: ReturnType<typeof spyOn<typeof console, "log">>;
  let warn: ReturnType<typeof spyOn<typeof console, "warn">>;

  beforeEach(async () => {
    await mkdir(stateDir, { recursive: true });
    delete process.env.PAIMON_ACCESS_TOKEN;
    alive = true;
    spawnedEnv = undefined;
    log = spyOn(console, "log").mockImplementation(() => {});
    warn = spyOn(console, "warn").mockImplementation(() => {});
    kill = spyOn(process, "kill").mockImplementation((pid, signal) => {
      if (pid !== oldPid || !alive)
        throw new Error("Test process is not alive");
      if (signal === "SIGTERM") alive = false;
      else if (signal !== 0) throw new Error("Unexpected process signal");
      return true;
    });
    health = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(async () => new Response("ok"), {
        preconnect: globalThis.fetch.preconnect,
      }),
    );
    // 不创建真实 daemon，只记录生产启动流程传入的环境变量
    spawn = spyOn(Bun, "spawn").mockImplementation(((
      _args: unknown,
      options: { env?: Record<string, string | undefined> },
    ) => {
      spawnedEnv = options.env;
      return { pid: newPid, exitCode: null, unref() {} };
    }) as unknown as typeof Bun.spawn);
  });

  afterEach(async () => {
    spawn.mockRestore();
    kill.mockRestore();
    health.mockRestore();
    log.mockRestore();
    warn.mockRestore();
    delete process.env.PAIMON_ACCESS_TOKEN;
    await rm(stateDir, { recursive: true, force: true });
  });

  async function seed(
    state: EdgeState = previous,
    localHub: HubState | null = hub,
  ) {
    await writeFile(edgePath, JSON.stringify(state));
    if (localHub) await writeFile(hubPath, JSON.stringify(localHub));
  }

  async function restart(hubUrl?: string, token?: string) {
    await handleEdgeRestart(undefined, undefined, undefined, hubUrl, token);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(health).toHaveBeenCalledTimes(1);
    return await readEdgeState();
  }

  test("status 展示脱敏 token，保留运行信息且不启动进程", async () => {
    await seed();
    await handleEdgeStatus();
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      "Edge is running",
      `  PID:     ${previous.pid}`,
      `  Bind:    ${previous.host}:${previous.port}`,
      `  Edge ID: ${previous.edgeId}`,
      `  Hub:     ${previous.hubUrl}`,
      "  Token:   prev****",
    ]);
    expect(log.mock.calls.flat().join(" ")).not.toContain(
      previous.accessToken!,
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(health).not.toHaveBeenCalled();
  });

  test("status 对没有 token 的旧状态显示 unknown", async () => {
    const { accessToken: _token, ...legacy } = previous;
    await seed(legacy);
    await handleEdgeStatus();
    expect(log).toHaveBeenCalledWith("  Token:   (unknown)");
  });

  test("status 对短 token 完全脱敏", async () => {
    await seed({ ...previous, accessToken: "abc" });
    await handleEdgeStatus();
    expect(log).toHaveBeenCalledWith("  Token:   ****");
    expect(log.mock.calls.flat().join(" ")).not.toContain("abc");
  });

  for (const hasState of [false, true]) {
    test(`status 在 Edge 未运行时不展示 token（状态文件：${hasState}）`, async () => {
      if (hasState) await seed();
      alive = false;
      await handleEdgeStatus();
      expect(log.mock.calls).toEqual([["Edge is not running"]]);
      expect(spawn).not.toHaveBeenCalled();
    });
  }

  test("restart 继承 token 和连接配置，保存状态且不在日志中暴露 token", async () => {
    await seed();
    const state = await restart();
    const { startedAt: _startedAt, ...connection } = previous;
    expect(state).toMatchObject({ ...connection, pid: newPid });
    expect(spawnedEnv?.PAIMON_ACCESS_TOKEN).toBe(previous.accessToken);
    expect(spawnedEnv?.PAIMON_HUB_URL).toBe(previous.hubUrl);
    expect(kill).toHaveBeenCalledWith(oldPid, "SIGTERM");
    expect(log.mock.calls.flat().join(" ")).toContain("inherited");
    expect(log.mock.calls.flat().join(" ")).not.toContain(
      previous.accessToken!,
    );
    expect((await stat(edgePath)).mode & 0o777).toBe(0o600);
    expect(await Bun.file(edgePath + ".tmp").exists()).toBe(false);
  });

  test("已有临时文件权限宽松时仍将状态文件权限收紧为 0600", async () => {
    await writeFile(edgePath + ".tmp", "stale", { mode: 0o644 });
    await startEdgeDaemon(
      previous.port,
      previous.host,
      previous.edgeId,
      previous.hubUrl,
      "explicit-token",
    );
    expect((await stat(edgePath)).mode & 0o777).toBe(0o600);
    expect(await Bun.file(edgePath + ".tmp").exists()).toBe(false);
    expect((await readEdgeState())?.accessToken).toBe("explicit-token");
  });

  test("环境变量优先于显式参数和旧 token", async () => {
    await seed();
    process.env.PAIMON_ACCESS_TOKEN = "environment-token";
    expect((await restart(undefined, "explicit-token"))?.accessToken).toBe(
      "environment-token",
    );
    expect(spawnedEnv?.PAIMON_ACCESS_TOKEN).toBe("environment-token");
  });

  test("显式参数优先于旧 token", async () => {
    await seed();
    expect((await restart(undefined, "explicit-token"))?.accessToken).toBe(
      "explicit-token",
    );
    expect(spawnedEnv?.PAIMON_ACCESS_TOKEN).toBe("explicit-token");
  });

  for (const url of [
    "ws://127.0.0.1:8080/",
    "ws://127.0.0.1:8080/ws/edge",
    "ws://localhost:8080",
  ]) {
    test(`等价 endpoint 继承旧 token：${url}`, async () => {
      await seed();
      expect((await restart(url))?.accessToken).toBe(previous.accessToken);
    });
  }

  for (const url of [
    "ws://other.example:8080",
    "ws://127.0.0.1:8081",
    "wss://127.0.0.1:8080",
    "ws://127.0.0.1:8080/other",
  ]) {
    test(`修改 Hub 地址时继续继承已保存 token：${url}`, async () => {
      await seed();
      const state = await restart(url);
      expect(state?.hubUrl).toBe(url);
      expect(state?.accessToken).toBe(previous.accessToken);
      expect(spawnedEnv?.PAIMON_HUB_URL).toBe(url);
      expect(spawnedEnv?.PAIMON_ACCESS_TOKEN).toBe(previous.accessToken);
      expect(warn).not.toHaveBeenCalled();
    });
  }

  test("更换地址时环境变量仍优先于显式参数和已保存 token", async () => {
    await seed();
    process.env.PAIMON_ACCESS_TOKEN = "environment-token";
    expect(
      (await restart("wss://other.example", "new-hub-token"))?.accessToken,
    ).toBe("environment-token");
    expect(spawnedEnv?.PAIMON_ACCESS_TOKEN).toBe("environment-token");
  });

  test("换 Hub 时可以显式配置新 token", async () => {
    await seed();
    expect(
      (await restart("wss://other.example", "new-hub-token"))?.accessToken,
    ).toBe("new-hub-token");
  });

  for (const localHub of [hub, null]) {
    test(`旧状态缺少 token 时不使用本机 Hub（hub.json：${Boolean(localHub)}）`, async () => {
      const { accessToken: _token, ...legacy } = previous;
      await seed(legacy, localHub);
      expect((await restart())?.accessToken).toBeUndefined();
      expect(spawnedEnv?.PAIMON_ACCESS_TOKEN).toBeUndefined();
    });
  }

  test("无旧状态文件时仍可以通过显式 token 重启", async () => {
    expect((await restart(undefined, "explicit-token"))?.accessToken).toBe(
      "explicit-token",
    );
  });

  for (const tokenSource of ["none", "env", "--token"]) {
    test(`start 忽略本机 hub.json，只使用主动配置：${tokenSource}`, async () => {
      await writeFile(hubPath, JSON.stringify(hub));
      if (tokenSource === "env")
        process.env.PAIMON_ACCESS_TOKEN = "environment-token";
      await startEdgeDaemon(
        previous.port,
        previous.host,
        previous.edgeId,
        previous.hubUrl,
        tokenSource === "--token" ? "explicit-token" : undefined,
      );
      const expected =
        tokenSource === "env"
          ? "environment-token"
          : tokenSource === "--token"
            ? "explicit-token"
            : undefined;
      expect((await readEdgeState())?.accessToken).toBe(expected);
      expect(spawnedEnv?.PAIMON_ACCESS_TOKEN).toBe(expected);
      expect(await Bun.file(hubPath).json()).toEqual(hub);
    });
  }

  test("更换目标为本机 Hub 时保留已保存 token，不读取 hub.json", async () => {
    await seed({ ...previous, hubUrl: "wss://old.example" });
    expect((await restart(previous.hubUrl))?.accessToken).toBe(
      previous.accessToken,
    );
    expect(spawnedEnv?.PAIMON_ACCESS_TOKEN).toBe(previous.accessToken);
  });

  test("stop 删除状态，随后 start 不继承旧 token", async () => {
    await seed(previous, null);
    await stopEdgeDaemon();
    expect(await Bun.file(edgePath).exists()).toBe(false);
    await startEdgeDaemon(
      previous.port,
      previous.host,
      previous.edgeId,
      previous.hubUrl,
    );
    expect((await readEdgeState())?.accessToken).toBeUndefined();
  });

  test("已运行的 Edge 不被重新启动或覆盖 token", async () => {
    await seed();
    await startEdgeDaemon(
      previous.port,
      previous.host,
      previous.edgeId,
      previous.hubUrl,
      "replacement-token",
    );
    expect(spawn).not.toHaveBeenCalled();
    expect(health).not.toHaveBeenCalled();
    expect((await readEdgeState())?.accessToken).toBe(previous.accessToken);
  });
}
