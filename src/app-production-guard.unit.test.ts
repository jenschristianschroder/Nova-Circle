import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from './app.js';
import type { Knex } from 'knex';

/**
 * Verifies that createApp() starts correctly in production even when no real
 * AI adapters are injected — fake adapters are used as a fallback.
 *
 * The production guard that used to throw for missing adapters was removed
 * because no real Azure AI adapters exist yet; blocking startup in production
 * prevented the health check from ever passing.
 */

function stubKnex(): Knex {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, prefer-const
  let proxy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler: ProxyHandler<any> = {
    get(_target, _prop) {
      // Return a function that always returns the proxy itself so that
      // chained method calls like `db('table').where(...)` never throw.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return (..._args: unknown[]) => proxy;
    },
    // Support calling the stub itself like db('table')
    apply() {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return proxy;
    },
  };
  // Callable function target so the Proxy supports db('table') invocations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  proxy = new Proxy(function () {} as any, handler);
  return proxy as Knex;
}

describe('createApp AI adapter fallback', () => {
  const originalEnv = process.env['NODE_ENV'];

  beforeEach(() => {
    process.env['NODE_ENV'] = 'production';
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalEnv;
    }
    vi.restoreAllMocks();
  });

  it('does not throw when AI adapters are missing in production (fake adapters are used)', () => {
    expect(() =>
      createApp({
        db: stubKnex(),
        tokenValidator: { validate: vi.fn() },
      }),
    ).not.toThrow();
  });

  it('does not throw when all real adapters are provided in production', () => {
    expect(() =>
      createApp({
        db: stubKnex(),
        tokenValidator: { validate: vi.fn() },
        eventFieldExtractor: { extract: vi.fn() } as never,
        speechToTextAdapter: { transcribe: vi.fn() } as never,
        imageExtractionAdapter: { extract: vi.fn() } as never,
        blobStorageAdapter: { store: vi.fn() } as never,
      }),
    ).not.toThrow();
  });
});
