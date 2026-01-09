/**
 * Structured Logger for Databricks Apps
 *
 * Outputs JSON logs in production (one line per event) for Databricks Apps readability.
 * Outputs formatted logs with colors in development for local debugging.
 */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Log levels
 */
const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
};

/**
 * ANSI color codes for development console
 */
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
};

/**
 * Format log entry for development (human-readable with colors)
 */
function formatDevelopment(level, data) {
  const timestamp = new Date().toISOString();
  const levelColors = {
    DEBUG: colors.dim,
    INFO: colors.blue,
    WARN: colors.yellow,
    ERROR: colors.red,
  };

  const color = levelColors[level] || colors.reset;
  const prefix = `${colors.dim}${timestamp}${colors.reset} ${color}${level.padEnd(5)}${colors.reset}`;

  if (typeof data === 'string') {
    return `${prefix} ${data}`;
  }

  // For objects, pretty print the important fields
  const parts = [];
  if (data.type) parts.push(`[${data.type}]`);
  if (data.message) parts.push(data.message);
  if (data.method && data.path) parts.push(`${data.method} ${data.path}`);
  if (data.status) parts.push(`status=${data.status}`);
  if (data.duration !== undefined) parts.push(`${data.duration}ms`);
  if (data.error) parts.push(`error: ${data.error}`);

  let formatted = `${prefix} ${parts.join(' ')}`;

  // Add additional details on next line if present
  const details = { ...data };
  delete details.type;
  delete details.message;
  delete details.method;
  delete details.path;
  delete details.status;
  delete details.duration;
  delete details.error;
  delete details.timestamp;
  delete details.level;

  if (Object.keys(details).length > 0) {
    formatted += `\n  ${colors.dim}${JSON.stringify(details)}${colors.reset}`;
  }

  return formatted;
}

/**
 * Format log entry for production (single-line JSON)
 */
function formatProduction(level, data) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    ...(typeof data === 'string' ? { message: data } : data),
  };

  return JSON.stringify(logEntry);
}

/**
 * Core logging function
 */
function log(level, data) {
  const formatted = isProduction ? formatProduction(level, data) : formatDevelopment(level, data);

  // Use appropriate console method
  switch (level) {
    case LogLevel.ERROR:
      console.error(formatted);
      break;
    case LogLevel.WARN:
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

/**
 * Public logging methods
 */
const logger = {
  debug: (data) => log(LogLevel.DEBUG, data),
  info: (data) => log(LogLevel.INFO, data),
  warn: (data) => log(LogLevel.WARN, data),
  error: (data) => log(LogLevel.ERROR, data),

  // Convenience method for request logging
  request: (data) => log(LogLevel.INFO, { type: 'request', ...data }),

  // Convenience method for response logging
  response: (data) => log(LogLevel.INFO, { type: 'response', ...data }),

  // Convenience method for database operations
  db: (data) => log(LogLevel.INFO, { type: 'database', ...data }),

  // Convenience method for Databricks operations
  databricks: (level, data) => log(level, { type: 'databricks', ...data }),
};

module.exports = logger;
