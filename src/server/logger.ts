/**
 * Structured JSON logger.
 *
 * In production every line is a single JSON object on stdout, which the
 * cluster's log collector (Grafana Alloy) ships to Loki. Query it there with
 * `{namespace="..."} | json | level="error"`.
 *
 * Log level can be overridden with LOG_LEVEL (trace|debug|info|warn|error|silent).
 */
import pino from 'pino';

const nodeEnv = process.env.NODE_ENV;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (nodeEnv === 'test' ? 'silent' : 'info'),
  base: { service: 'ticketing-app' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    // emit `"level":"error"` instead of `"level":50` so log queries are readable
    level: (label) => ({ level: label }),
  },
  ...(nodeEnv === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});
