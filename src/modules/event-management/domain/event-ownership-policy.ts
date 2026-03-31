import type { Event, UpdateEventData } from './event.js';
import type { IdentityContext } from '../../../shared/auth/identity-context.js';

/**
 * Centralised authorization rules for event ownership.
 *
 * Enforces:
 * 1. Only the event owner can perform owner-restricted operations.
 * 2. The `ownerId` field is immutable through normal update flows.
 *    Any attempt to include ownership-related keys in update data is
 *    stripped at runtime (defense-in-depth against TypeScript type erasure).
 */
export class EventOwnershipPolicy {
  /**
   * Asserts that the caller is the owner of the given event.
   *
   * Throws coded errors:
   * - `NOT_FOUND` – event does not exist (avoids disclosing existence)
   * - `NOT_FOUND` – caller is not the owner (avoids disclosing existence)
   */
  static assertCallerIsOwner(
    event: Event | null,
    caller: IdentityContext,
  ): asserts event is Event {
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    if (event.ownerId !== caller.userId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
  }

  /**
   * Runtime guard that strips ownership-related fields from update data.
   *
   * TypeScript's `UpdateEventData` does not include `ownerId`, but types
   * are erased at runtime.  A malicious or buggy caller could attach extra
   * properties to the object.  This method returns a clean copy that is
   * guaranteed to contain only the allowed update fields.
   */
  static sanitizeUpdateData(data: UpdateEventData): UpdateEventData {
    return {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.startAt !== undefined ? { startAt: data.startAt } : {}),
      ...('endAt' in data ? { endAt: data.endAt } : {}),
    };
  }
}
