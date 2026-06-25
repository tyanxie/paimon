// Hub 日志实例

import { DEFAULTS } from "../protocol/types";
import { createLogger } from "../utils/logger";

const log = createLogger(DEFAULTS.HUB_LOG_NAME, "[paimon-hub]");
export const { info, warn, error, debug, shutdown } = log;
