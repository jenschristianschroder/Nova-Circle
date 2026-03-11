import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TelemetryClient } from 'applicationinsights';

/**
 * Unit tests for the shared logger wrapper.
 *
 * The logger forwards to Application Insights when a TelemetryClient is
 * registered and falls back to the Node.js console otherwise.
 *
 * Tests cover:
 *  - LOG_LEVEL filtering
 *  - Console fallback when App Insights is not initialised
 *  - App Insights trace/exception routing when client is registered
 *  - `err` argument handling (Error vs non-Error vs undefined)
 *  - `meta` argument handling (present, absent)
 *  - Privacy: no sensitive data injected by the logger itself
 */

// We import the module under test dynamically inside each test or describe
// block so we can control the module-level `appInsightsClient` state via
// `setTelemetryClient`.
import { logger, setTelemetryClient } from './logger.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeFakeClient(): TelemetryClient & {
  trackTrace: ReturnType<typeof vi.fn>;
  trackException: ReturnType<typeof vi.fn>;
} {
  return {
    trackTrace: vi.fn(),
    trackException: vi.fn(),
  } as unknown as TelemetryClient & {
    trackTrace: ReturnType<typeof vi.fn>;
    trackException: ReturnType<typeof vi.fn>;
  };
}

// ── Console fallback (no App Insights client) ──────────────────────────────

describe('logger – console fallback (no App Insights client)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Ensure no client is registered for these tests.
    // Cast is needed because setTelemetryClient only accepts a real client;
    // passing undefined resets the internal state.
    setTelemetryClient(undefined as unknown as TelemetryClient);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logger.info() writes a JSON line to console.log', () => {
    logger.info('hello world');
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const parsed: unknown = JSON.parse(consoleLogSpy.mock.calls[0]?.[0] as string);
    expect(parsed).toMatchObject({ level: 'info', message: 'hello world' });
  });

  it('logger.info() includes meta fields in the JSON output', () => {
    logger.info('operation complete', { resourceId: 'abc-123', count: 5 });
    const parsed: unknown = JSON.parse(consoleLogSpy.mock.calls[0]?.[0] as string);
    expect(parsed).toMatchObject({ resourceId: 'abc-123', count: 5 });
  });

  it('logger.warn() writes to console.warn', () => {
    logger.warn('something unexpected', { code: 'WARN_CODE' });
    expect(consoleWarnSpy).toHaveBeenCalledOnce();
    const parsed: unknown = JSON.parse(consoleWarnSpy.mock.calls[0]?.[0] as string);
    expect(parsed).toMatchObject({ level: 'warn', code: 'WARN_CODE' });
  });

  it('logger.error() writes to console.error with errorMessage and errorName', () => {
    const err = new Error('something broke');
    logger.error('operation failed', err);
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const parsed: unknown = JSON.parse(consoleErrorSpy.mock.calls[0]?.[0] as string);
    expect(parsed).toMatchObject({
      level: 'error',
      message: 'operation failed',
      errorMessage: 'something broke',
      errorName: 'Error',
    });
  });

  it('logger.error() with no err argument omits error fields', () => {
    logger.error('plain error message');
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(consoleErrorSpy.mock.calls[0]?.[0] as string) as Record<
      string,
      unknown
    >;
    expect(parsed['message']).toBe('plain error message');
    expect(parsed['errorMessage']).toBeUndefined();
    expect(parsed['error']).toBeUndefined();
  });

  it('logger.error() with a string err includes it as "error" field', () => {
    logger.error('operation failed', 'timeout');
    const parsed = JSON.parse(consoleErrorSpy.mock.calls[0]?.[0] as string) as Record<
      string,
      unknown
    >;
    expect(parsed['error']).toBe('timeout');
  });

  it('logger.debug() is suppressed when LOG_LEVEL is info (default)', () => {
    // Default LOG_LEVEL is 'info'; debug should not be emitted.
    const originalLevel = process.env['LOG_LEVEL'];
    delete process.env['LOG_LEVEL'];
    logger.debug('verbose detail');
    expect(consoleLogSpy).not.toHaveBeenCalled();
    if (originalLevel !== undefined) process.env['LOG_LEVEL'] = originalLevel;
  });

  it('logger.debug() is emitted when LOG_LEVEL=debug', () => {
    const originalLevel = process.env['LOG_LEVEL'];
    process.env['LOG_LEVEL'] = 'debug';
    logger.debug('verbose detail', { step: 1 });
    expect(consoleLogSpy).toHaveBeenCalledOnce();
    const parsed: unknown = JSON.parse(consoleLogSpy.mock.calls[0]?.[0] as string);
    expect(parsed).toMatchObject({ level: 'debug', message: 'verbose detail' });
    process.env['LOG_LEVEL'] = originalLevel ?? '';
    if (!originalLevel) delete process.env['LOG_LEVEL'];
  });

  it('logger.warn() is suppressed when LOG_LEVEL=error', () => {
    const originalLevel = process.env['LOG_LEVEL'];
    process.env['LOG_LEVEL'] = 'error';
    logger.warn('this should be silent');
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    process.env['LOG_LEVEL'] = originalLevel ?? '';
    if (!originalLevel) delete process.env['LOG_LEVEL'];
  });

  it('logger.info() with no meta does not produce undefined in output', () => {
    logger.info('no meta');
    const raw = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(raw).not.toContain('undefined');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(parsed['message']).toBe('no meta');
  });
});

// ── App Insights forwarding ────────────────────────────────────────────────

describe('logger – App Insights forwarding (client registered)', () => {
  let fakeClient: ReturnType<typeof makeFakeClient>;

  beforeEach(() => {
    fakeClient = makeFakeClient();
    setTelemetryClient(fakeClient as unknown as TelemetryClient);
  });

  afterEach(() => {
    setTelemetryClient(undefined as unknown as TelemetryClient);
  });

  it('logger.info() calls trackTrace with Information severity', () => {
    logger.info('server ready', { port: 3000 });
    expect(fakeClient.trackTrace).toHaveBeenCalledOnce();
    const call = fakeClient.trackTrace.mock.calls[0]?.[0] as { severity: string };
    expect(call.severity).toBe('Information');
  });

  it('logger.warn() calls trackTrace with Warning severity', () => {
    logger.warn('slow query');
    expect(fakeClient.trackTrace).toHaveBeenCalledOnce();
    const call = fakeClient.trackTrace.mock.calls[0]?.[0] as { severity: string };
    expect(call.severity).toBe('Warning');
  });

  it('logger.error() with an Error calls trackException (not trackTrace)', () => {
    const err = new Error('DB connection lost');
    logger.error('database error', err);
    expect(fakeClient.trackException).toHaveBeenCalledOnce();
    expect(fakeClient.trackTrace).not.toHaveBeenCalled();
    const call = fakeClient.trackException.mock.calls[0]?.[0] as { exception: Error };
    expect(call.exception).toBe(err);
  });

  it('logger.error() with no Error calls trackTrace with Error severity', () => {
    logger.error('config missing');
    expect(fakeClient.trackTrace).toHaveBeenCalledOnce();
    expect(fakeClient.trackException).not.toHaveBeenCalled();
    const call = fakeClient.trackTrace.mock.calls[0]?.[0] as { severity: string };
    expect(call.severity).toBe('Error');
  });

  it('logger.error() with a string err calls trackTrace with Error severity', () => {
    logger.error('upstream timeout', 'ETIMEOUT');
    expect(fakeClient.trackTrace).toHaveBeenCalledOnce();
    const call = fakeClient.trackTrace.mock.calls[0]?.[0] as {
      severity: string;
      properties?: Record<string, unknown>;
    };
    expect(call.severity).toBe('Error');
    expect(call.properties?.['error']).toBe('ETIMEOUT');
  });

  it('logger.debug() calls trackTrace with Verbose severity when level is debug', () => {
    const originalLevel = process.env['LOG_LEVEL'];
    process.env['LOG_LEVEL'] = 'debug';
    logger.debug('trace detail');
    expect(fakeClient.trackTrace).toHaveBeenCalledOnce();
    const call = fakeClient.trackTrace.mock.calls[0]?.[0] as { severity: string };
    expect(call.severity).toBe('Verbose');
    process.env['LOG_LEVEL'] = originalLevel ?? '';
    if (!originalLevel) delete process.env['LOG_LEVEL'];
  });

  it('trackTrace properties include meta fields', () => {
    logger.info('request processed', { durationMs: 42, route: '/health' });
    const call = fakeClient.trackTrace.mock.calls[0]?.[0] as {
      properties?: Record<string, unknown>;
    };
    expect(call.properties).toMatchObject({ durationMs: 42, route: '/health' });
  });

  it('trackTrace does not include properties when meta is absent', () => {
    logger.info('startup complete');
    const call = fakeClient.trackTrace.mock.calls[0]?.[0] as {
      properties?: unknown;
    };
    expect(call.properties).toBeUndefined();
  });
});

// ── Privacy rules ──────────────────────────────────────────────────────────

describe('logger – privacy rules', () => {
  it('does not auto-inject sensitive keys into output', () => {
    // The logger must not automatically add fields like password, token, email
    // to log output. Callers control what goes in meta.
    setTelemetryClient(undefined as unknown as TelemetryClient);
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.info('user action', { userId: 'u-123' });

    const raw = consoleLogSpy.mock.calls[0]?.[0] as string;
    expect(raw).not.toContain('password');
    expect(raw).not.toContain('token');
    expect(raw).not.toContain('email');

    vi.restoreAllMocks();
    setTelemetryClient(undefined as unknown as TelemetryClient);
  });
});
