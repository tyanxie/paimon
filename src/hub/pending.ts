// 通用 WS request-response 等待器
//
// 用于 Hub 向 Edge 发送请求后等待异步回复的场景。
// 通过 token 匹配请求与响应，支持超时自动 reject。

/**
 * 泛型 pending request 管理器。
 * T 为 resolve 时返回的结果类型。
 */
export class PendingRequests<T> {
  private map = new Map<
    string,
    { resolve: (result: T) => void; reject: (err: Error) => void; timer: Timer }
  >();

  /**
   * 注册一个等待中的请求，返回 Promise。
   * @param token 唯一标识，用于匹配响应
   * @param timeoutMs 超时毫秒数，超时后自动 reject
   * @param timeoutMessage 超时时的错误消息
   */
  register(
    token: string,
    timeoutMs: number,
    timeoutMessage?: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.map.delete(token);
        reject(
          new Error(
            timeoutMessage ?? `Request timed out (${timeoutMs / 1000}s)`,
          ),
        );
      }, timeoutMs);

      this.map.set(token, { resolve, reject, timer });
    });
  }

  /**
   * 以成功结果解决一个 pending 请求。
   * @returns 是否找到并解决了对应的 pending
   */
  resolve(token: string, result: T): boolean {
    const p = this.map.get(token);
    if (!p) return false;
    clearTimeout(p.timer);
    this.map.delete(token);
    p.resolve(result);
    return true;
  }

  /**
   * 以错误拒绝一个 pending 请求。
   * @returns 是否找到并拒绝了对应的 pending
   */
  reject(token: string, error: string): boolean {
    const p = this.map.get(token);
    if (!p) return false;
    clearTimeout(p.timer);
    this.map.delete(token);
    p.reject(new Error(error));
    return true;
  }

  /** 检查某个 token 是否仍在等待中 */
  has(token: string): boolean {
    return this.map.has(token);
  }

  /** 当前等待中的请求数 */
  get size(): number {
    return this.map.size;
  }
}
