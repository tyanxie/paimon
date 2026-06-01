// 网络 host 相关工具函数

/** host 是否为 loopback（127.0.0.1 / localhost / ::1） */
export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

/** 非 loopback host 警告文案（英文，无 emoji） */
export function nonLoopbackWarning(host: string): string {
  return (
    `WARNING: Hub bound to ${host} (non-loopback). The web panel can spawn pi\n` +
    `instances with full system access. Only use this on trusted networks.`
  );
}
