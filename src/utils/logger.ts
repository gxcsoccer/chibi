/**
 * Logger utility
 */

import pino from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

let logger: pino.Logger | null = null;

export interface LoggerConfig {
  level: LogLevel;
  pretty: boolean;
  destination?: string;
}

/**
 * Initialize the logger
 */
export function initLogger(config: LoggerConfig): pino.Logger {
  const options: pino.LoggerOptions = {
    level: config.level,
  };

  if (config.pretty) {
    logger = pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  } else if (config.destination) {
    logger = pino(options, pino.destination(config.destination));
  } else {
    logger = pino(options);
  }

  return logger;
}

/**
 * Get the logger instance
 */
export function getLogger(): pino.Logger {
  if (!logger) {
    // Default logger for development
    logger = pino({
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }
  return logger;
}

