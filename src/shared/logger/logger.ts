/**
 * Thin structured logger that forwards to Application Insights traces when the
 * SDK is initialised, and falls back to the Node.js console otherwise.
 *
 * Usage:
 *   import { logger } from './shared/logger/logger.js';
 *   logger.info('Server started', { port });
 *   logger.warn('Something unexpected', { code });
 *   logger.error('Unhandled error', err);
 *
 * Privacy rules enforced here:
 *  - No token values, passwords, or secrets in trace messages.
 *  - No raw request/response bodies.
 *  - No email addresses or personal identifiers.
 *  - No event content, chat messages, or location details at broad log levels.
 *
 * Callers are responsible for not passing sensitive data.
 */

import type * as AppInsights from 'applicationinsights';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function resolveLevel(): LogLevel {
  const raw = process.env['LOG_LEVEL']?.toLowerCase();
  if (raw && raw in LOG_LEVELS) return raw as LogLevel;
  return 'info';
}

let appInsightsClient: AppInsights.TelemetryClient | undefined;

/**
 * Provide the Application Insights telemetry client once the SDK has been
 * initialised in `server.ts`. The logger falls back to console when this is
 * not called.
 */
export function setTelemetryClient(client: AppInsights.TelemetryClient): void {
  appInsightsClient = client;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[resolveLevel()];
}

function formatMessage(message: string, meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return message;
  return `${message} ${JSON.stringify(meta)}`;
}

function toSeverity(level: LogLevel): string {
  // Application Insights SeverityLevel string values:
  // Verbose, Information, Warning, Error, Critical
  switch (level) {
    case 'debug':
      return 'Verbose';
    case 'info':
      return 'Information';
    case 'warn':
      return 'Warning';
    case 'error':
      return 'Error';
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable value]';
  }
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  if (appInsightsClient) {
    appInsightsClient.trackTrace({
      message: formatMessage(message, meta),
      severity: toSeverity(level),
      ...(meta !== undefined ? { properties: meta } : {}),
    });
  } else {
    const entry = JSON.stringify({ level, message, ...(meta ?? {}) });
    switch (level) {
      case 'error':
        console.error(entry);
        break;
      case 'warn':
        console.warn(entry);
        break;
      default:
        console.log(entry);
    }
  }
}

function emitError(message: string, err: unknown, meta?: Record<string, unknown>): void {
  if (!shouldLog('error')) return;

  // Only include error fields when err is actually provided.
  const errFields: Record<string, unknown> =
    err === undefined
      ? {}
      : err instanceof Error
        ? { errorMessage: err.message, errorName: err.name }
        : { error: typeof err === 'string' ? err : safeStringify(err) };

  const errMeta: Record<string, unknown> = { ...(meta ?? {}), ...errFields };

  if (appInsightsClient) {
    if (err instanceof Error) {
      appInsightsClient.trackException({
        exception: err,
        properties: { logMessage: message, ...(meta ?? {}) },
      });
    } else {
      appInsightsClient.trackTrace({
        message: formatMessage(message, Object.keys(errMeta).length > 0 ? errMeta : undefined),
        severity: toSeverity('error'),
        ...(Object.keys(errMeta).length > 0 ? { properties: errMeta } : {}),
      });
    }
  } else {
    console.error(JSON.stringify({ level: 'error', message, ...errMeta }));
  }
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    emit('info', message, meta);
  },

  warn(message: string, meta?: Record<string, unknown>): void {
    emit('warn', message, meta);
  },

  /**
   * Log an error. Pass the caught value as `err` so stack traces are
   * forwarded to Application Insights as exceptions rather than plain traces.
   * Do NOT include sensitive data (tokens, passwords, personal identifiers) in
   * `message` or `meta`.
   */
  error(message: string, err?: unknown, meta?: Record<string, unknown>): void {
    emitError(message, err, meta);
  },

  debug(message: string, meta?: Record<string, unknown>): void {
    emit('debug', message, meta);
  },
} as const;
