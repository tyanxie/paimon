import { dirname } from "node:path";
import { scanSessionDirectory, scanSessionFile } from "./scanner";
import type { SessionIndex, SessionSummary } from "./types";

interface DirectoryRefresh {
  ready: boolean;
  fullRequested: boolean;
  task?: Promise<void>;
}

export class SessionRefresh {
  private instances = new Map<string, string>();
  private directories = new Map<string, DirectoryRefresh>();
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private index: SessionIndex,
    private onError: (directory: string, error: unknown) => void,
    private onUpdate: (directory: string, sessions: SessionSummary[]) => void,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const directories = new Set(
        [...this.instances.values()].map((path) => dirname(path)),
      );
      for (const directory of directories) {
        const state = this.directories.get(directory);
        if (state?.task) continue;
        this.refresh(directory, !state?.ready);
      }
    }, 5000);
  }

  register(instanceId: string, sessionFile: string | undefined): void {
    if (!sessionFile) {
      this.instances.delete(instanceId);
      return;
    }
    const previousFile = this.instances.get(instanceId);
    this.instances.set(instanceId, sessionFile);
    if (previousFile === sessionFile) return;
    this.refresh(dirname(sessionFile), true);
  }

  unregister(instanceId: string): void {
    this.instances.delete(instanceId);
  }

  private refresh(directory: string, full: boolean): void {
    let state = this.directories.get(directory);
    if (!state) {
      state = { ready: false, fullRequested: false };
      this.directories.set(directory, state);
    }
    state.fullRequested ||= full;
    if (state.task) return;
    const current = state;
    current.task = Promise.resolve()
      .then(async () => {
        do {
          if (current.fullRequested) {
            current.fullRequested = false;
            const { sessions, failedPaths } = await scanSessionDirectory(
              directory,
              this.onError,
            );
            if (failedPaths.length > 0) {
              const previous = await this.index.query(directory, {
                limit: Number.MAX_SAFE_INTEGER,
              });
              const failed = new Set(failedPaths);
              sessions.push(
                ...previous.sessions.filter((session) =>
                  failed.has(session.path),
                ),
              );
            }
            await this.index.replaceDirectory(directory, sessions);
            current.ready = true;
          } else {
            const paths = new Set(
              [...this.instances.values()].filter(
                (path) => dirname(path) === directory,
              ),
            );
            for (const path of paths) {
              try {
                const session = await scanSessionFile(path);
                if (session) await this.index.updateSession(directory, session);
                else await this.index.removeSession(directory, path);
              } catch (error) {
                // 读取失败保留旧摘要，不影响同目录其他文件刷新
                this.onError(path, error);
              }
            }
          }
          const snapshot = await this.index.query(directory, {
            limit: Number.MAX_SAFE_INTEGER,
          });
          this.onUpdate(directory, snapshot.sessions);
          // 扫描期间的注册可能引入新文件，合并为下一次目录扫描
        } while (current.fullRequested);
      })
      .catch((error: unknown) => this.onError(directory, error))
      .finally(() => {
        current.task = undefined;
      });
  }
}
