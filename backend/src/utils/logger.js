'use strict';

/**
 * Structured Logger Utility
 *
 * Provides consistent logging with levels, timestamps, and context.
 * Supports runtime log level changes via setLevel() — no server restart needed.
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const VALID_LEVELS = Object.keys(LOG_LEVELS);

// Mutable runtime level — starts from env var, can be changed via setLevel()
let _currentLevel = (process.env.LOG_LEVEL || 'INFO').toUpperCase();
if (!VALID_LEVELS.includes(_currentLevel)) {
  _currentLevel = 'INFO';
}

/**
 * Set the log level at runtime. Takes effect immediately for all subsequent calls.
 * @param {string} level - One of 'debug' | 'info' | 'warn' | 'error' (case-insensitive)
 * @throws {Error} if level is invalid
 */
function setLevel(level) {
  const upper = (level || '').toUpperCase();
  if (!VALID_LEVELS.includes(upper)) {
    throw new Error(`Invalid log level "${level}". Must be one of: ${VALID_LEVELS.join(', ').toLowerCase()}`);
  }
  _currentLevel = upper;
}

/**
 * Get the current log level.
 * @returns {string} current level in lowercase
 */
function getLevel() {
  return _currentLevel.toLowerCase();
}

function shouldLog(level) {
  return LOG_LEVELS[level] <= LOG_LEVELS[_currentLevel];
}

function formatMessage(level, message, ...args) {
  const timestamp = new Date().toISOString();
  const formattedArgs = args.map(arg => {
    if (arg instanceof Error) {
      return { message: arg.message, stack: arg.stack, ...arg };
    }
    return arg;
  });

  return {
    timestamp,
    level,
    message,
    args: formattedArgs.length > 0 ? formattedArgs : undefined,
    pid: process.pid,
  };
}

const logger = {
  error(message, ...args) {
    if (shouldLog('ERROR')) {
      console.error(JSON.stringify(formatMessage('ERROR', message, ...args)));
    }
  },

  warn(message, ...args) {
    if (shouldLog('WARN')) {
      console.warn(JSON.stringify(formatMessage('WARN', message, ...args)));
    }
  },

  info(message, ...args) {
    if (shouldLog('INFO')) {
      console.log(JSON.stringify(formatMessage('INFO', message, ...args)));
    }
  },

  debug(message, ...args) {
    if (shouldLog('DEBUG')) {
      console.log(JSON.stringify(formatMessage('DEBUG', message, ...args)));
    }
  },

  /**
   * Create a child logger with additional context prefix.
   */
  child(context) {
    return {
      error: (message, ...args) => logger.error(`[${context}] ${message}`, ...args),
      warn:  (message, ...args) => logger.warn(`[${context}] ${message}`, ...args),
      info:  (message, ...args) => logger.info(`[${context}] ${message}`, ...args),
      debug: (message, ...args) => logger.debug(`[${context}] ${message}`, ...args),
    };
  },

  setLevel,
  getLevel,
};

module.exports = logger;
module.exports.logger = logger;
module.exports.setLevel = setLevel;
module.exports.getLevel = getLevel;
