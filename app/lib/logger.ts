// Logger utility that respects configured log level from database

import prisma from './db';

// Log levels in order of verbosity (lower = more verbose)
const LOG_LEVELS = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

// Cache the log level to avoid DB queries on every log
let cachedLogLevel: LogLevel = 'info';
let lastFetch = 0;
const CACHE_TTL = 60000; // 1 minute

async function getLogLevel(): Promise<LogLevel> {
  const now = Date.now();
  
  // Use cached value if still valid
  if (now - lastFetch < CACHE_TTL) {
    return cachedLogLevel;
  }
  
  try {
    const config = await prisma.config.findUnique({
      where: { key: 'LogLevel' },
    });
    
    if (config?.value && config.value in LOG_LEVELS) {
      cachedLogLevel = config.value as LogLevel;
    }
    lastFetch = now;
  } catch {
    // On error, use cached/default value
  }
  
  return cachedLogLevel;
}

// Synchronous check using cached value (for performance in hot paths)
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[cachedLogLevel];
}

// Format log message with timestamp and level
function formatMessage(level: LogLevel, message: string, context?: string): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? `[${context}] ` : '';
  return `${timestamp} [${level.toUpperCase()}] ${contextStr}${message}`;
}

// Logger object with methods for each level
export const logger = {
  /**
   * Refresh the cached log level from database
   * Call this after changing the LogLevel config
   */
  async refresh(): Promise<void> {
    lastFetch = 0;
    await getLogLevel();
  },

  /**
   * Most verbose - detailed tracing information
   */
  trace(message: string, context?: string, ...args: unknown[]): void {
    if (shouldLog('trace')) {
      console.log(formatMessage('trace', message, context), ...args);
    }
  },

  /**
   * Debug information useful during development
   */
  debug(message: string, context?: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.log(formatMessage('debug', message, context), ...args);
    }
  },

  /**
   * General information about application flow
   */
  info(message: string, context?: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message, context), ...args);
    }
  },

  /**
   * Warning conditions that might indicate a problem
   */
  warn(message: string, context?: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message, context), ...args);
    }
  },

  /**
   * Error conditions - should always be logged
   */
  error(message: string, context?: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(formatMessage('error', message, context), ...args);
    }
  },
};

// Initialize cached log level on module load
getLogLevel();

export default logger;
