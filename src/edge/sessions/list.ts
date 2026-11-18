import { dirname } from "node:path";
import { isCompiled } from "../../utils/env";
import type { SessionIndex, SessionQuery, SessionQueryResult } from "./types";
import type {
  SessionWorkerRequest,
  SessionWorkerResponse,
} from "./worker-messages";

export class SessionList {
  private worker?: Worker;
  private instances = new Map<string, string>();
  private restartTimer?: ReturnType<typeof setTimeout>;
  private running = false;

  constructor(
    private index: SessionIndex,
    private onError: (directory: string, error: unknown) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startWorker();
  }

  private startWorker(): void {
    if (!this.running || this.worker) return;
    let worker: Worker;
    try {
      worker = new Worker(
        isCompiled
          ? "./src/edge/sessions/worker.ts"
          : new URL("./worker.ts", import.meta.url).href,
      );
    } catch (error) {
      this.onError("worker", error);
      this.scheduleRestart();
      return;
    }
    this.worker = worker;
    worker.onmessage = (event: MessageEvent<SessionWorkerResponse>) => {
      if (this.worker !== worker) return;
      const message = event.data;
      switch (message.type) {
        case "snapshot":
          // 只发布完整的轻量摘要，查询不等待后台刷新
          this.index
            .replaceDirectory(message.directory, message.sessions)
            .catch((error: unknown) => this.onError(message.directory, error));
          break;
        case "error":
          this.onError(message.directory, message.message);
          break;
      }
    };
    worker.onerror = (event) => this.handleWorkerFailure(worker, event.message);
    worker.addEventListener("close", () => {
      this.handleWorkerFailure(worker, "Session worker closed");
    });
    // 重建后重新注册当前实例，后台恢复索引时查询继续使用旧快照
    for (const [instanceId, sessionFile] of this.instances) {
      this.send({ type: "register", instanceId, sessionFile });
    }
  }

  register(instanceId: string, sessionFile: string | undefined): void {
    if (sessionFile) this.instances.set(instanceId, sessionFile);
    else this.instances.delete(instanceId);
    this.send({ type: "register", instanceId, sessionFile });
  }

  unregister(instanceId: string): void {
    this.instances.delete(instanceId);
    this.send({ type: "unregister", instanceId });
  }

  async query(
    sessionFile: string | undefined,
    params?: SessionQuery,
  ): Promise<SessionQueryResult> {
    if (!sessionFile) return { sessions: [], total: 0, hasMore: false };
    return this.index.query(dirname(sessionFile), params);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = undefined;
    this.instances.clear();
    const worker = this.worker;
    this.worker = undefined;
    worker?.terminate();
  }

  private handleWorkerFailure(worker: Worker, error: unknown): void {
    if (this.worker !== worker) return;
    this.worker = undefined;
    this.onError("worker", error);
    worker.terminate();
    this.scheduleRestart();
  }

  private scheduleRestart(): void {
    if (!this.running || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      this.startWorker();
    }, 5000);
  }

  private send(message: SessionWorkerRequest): void {
    const worker = this.worker;
    if (!worker) return;
    try {
      worker.postMessage(message);
    } catch (error) {
      this.handleWorkerFailure(worker, error);
    }
  }
}
