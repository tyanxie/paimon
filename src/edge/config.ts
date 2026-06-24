// Edge 配置常量（从环境变量或系统信息派生）

import { resolve, join } from "node:path";
import { homedir, hostname } from "node:os";
import { DEFAULTS } from "../protocol/types";

/** Edge 标识：环境变量优先，降级为主机名 */
export const edgeId: string = process.env.PAIMON_EDGE_ID || hostname();

/** 状态目录 ~/.paimon */
export const STATE_DIR = resolve(homedir(), ".paimon");

/** spawn 实例的运行时文件目录 ~/.paimon/instances */
export const INSTANCES_DIR = join(STATE_DIR, DEFAULTS.INSTANCES_DIR);
