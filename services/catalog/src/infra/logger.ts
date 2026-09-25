import { createLogger, type Logger } from '@streaming/shared-logging';

export type { Logger };

/** Process-wide structured logger for this service, tagged `service_name: "catalog"`. See @streaming/shared-logging for redaction rules. */
export const logger: Logger = createLogger('catalog');
