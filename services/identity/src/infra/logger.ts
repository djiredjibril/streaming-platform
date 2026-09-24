import { createLogger, type Logger } from '@streaming/shared-logging';

export type { Logger };

export const logger: Logger = createLogger('identity');
