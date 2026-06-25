// Edge 日志实例

import { DEFAULTS } from "../protocol/types";
import { createLogger } from "../utils/logger";

const log = createLogger(DEFAULTS.EDGE_LOG_NAME, "[paimon-edge]");
export const { info, warn, error, debug, shutdown } = log;
