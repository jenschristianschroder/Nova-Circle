import { v4 as uuidv4 } from 'uuid';
import type { IdentityContext } from '../auth/identity-context.js';
export type { IdentityContext } from '../auth/identity-context.js';

/**
 * FakeIdentity – produces deterministic IdentityContext values for tests.
 *
 * Use named presets for common test actors to keep test intent clear.
 * Never use FakeIdentity outside of test code.
 *
 * @example
 * const identity = FakeIdentity.user('alice');
 * // identity.userId is a stable UUID derived from 'alice'
 */
export class FakeIdentity {
  /**
   * Creates a deterministic IdentityContext for the named test actor.
   * The same name always produces the same userId so assertions stay stable.
   */
  static user(name: string): IdentityContext {
    // Derive a stable UUID from the name using a simple namespace approach.
    // This is test-only and must never be used for production identity.
    const deterministicId = uuidFromName(name);
    return { userId: deterministicId, displayName: name };
  }

  /** Generates a unique IdentityContext with a random userId. */
  static random(): IdentityContext {
    return { userId: uuidv4(), displayName: `test-user-${uuidv4().slice(0, 8)}` };
  }
}

/**
 * Produces a deterministic UUID v4-like string from a name string.
 * Purely for test fixtures – not cryptographically meaningful.
 */
function uuidFromName(name: string): string {
  // Create a repeatable hex string from the name characters.
  const padded = name.padEnd(32, '0').slice(0, 32);
  const hex = Array.from(padded)
    .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`, // version 4
    `8${hex.slice(17, 20)}`, // variant bits
    hex.slice(20, 32),
  ].join('-');
}
