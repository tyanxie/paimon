// Edge 配置常量（从环境变量或系统信息派生）

import { hostname } from "node:os";

/** Edge 标识：环境变量优先，降级为主机名 */
export const edgeId: string = process.env.PAIMON_EDGE_ID || hostname();
