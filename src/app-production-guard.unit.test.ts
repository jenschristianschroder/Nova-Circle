import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from './app.js';
import type { Knex } from 'knex';

/**
 * Verifies that the production guard in createApp() rejects missing AI
 * adapters when NODE_ENV is "production".  A real Knex instance is not
 * required – the guard fires before any database work, so a stubbed
 * Knex that returns itself on every builder method is sufficient.
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

describe('createApp production guard', () => {
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

  it('throws when AI adapters are missing in production', () => {
    expect(() =>
      createApp({
        db: stubKnex(),
        tokenValidator: { validate: vi.fn() },
      }),
    ).toThrow(/Missing required AI adapters in production/);
  });

  it('includes the names of all missing adapters in the error message', () => {
    expect(() =>
      createApp({
        db: stubKnex(),
        tokenValidator: { validate: vi.fn() },
      }),
    ).toThrow(
      /eventFieldExtractor.*speechToTextAdapter.*imageExtractionAdapter.*blobStorageAdapter/,
    );
  });

  it('does not throw when all adapters are provided', () => {
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
