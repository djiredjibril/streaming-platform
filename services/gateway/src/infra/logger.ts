import { createLogger, type Logger } from '@streaming/shared-logging';

export type { Logger };

/** Process-wide structured logger for this service, tagged `service_name: "gateway"`. */
export const logger: Logger = createLogger('gateway');
