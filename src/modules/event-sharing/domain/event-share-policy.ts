import type { Event } from '../../event-management/domain/event.js';
import type { IdentityContext } from '../../../shared/auth/identity-context.js';

/**
 * Centralised authorization rules for `event_shares` operations.
 *
 * Every write (create, update, revoke) and read (list) against the
 * `event_shares` table must pass through one of the assertion helpers
 * below **before** the persistence layer is touched.
 *
 * Rules enforced:
 * 1. The event must exist.
 * 2. The event must be a personal event (`groupId === null`).
 *    Group-scoped events cannot be shared; they are already tied to a group.
 * 3. The caller must be the event owner (`event.ownerId === caller.userId`).
 *    Only the event owner may create, update, revoke, or list shares.
 *
 * For **creating** a share an additional rule applies:
 * 4. The caller must be a current member of the target group.
 */
export class EventSharePolicy {
  /**
   * Asserts that the caller is the owner of a personal event.
   *
   * Throws coded errors consumed by the presentation layer:
   * - `NOT_FOUND`  – event does not exist
   * - `FORBIDDEN`  – event is group-scoped, or caller is not the owner
   */
  static assertOwnerOfPersonalEvent(
    event: Event | null,
    caller: IdentityContext,
    action: string,
  ): asserts event is Event {
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    if (event.groupId !== null) {
      throw Object.assign(new Error('Only personal events can be shared to groups'), {
        code: 'FORBIDDEN',
      });
    }

    if (event.ownerId !== caller.userId) {
      throw Object.assign(new Error(`Only the event owner can ${action}`), {
        code: 'FORBIDDEN',
      });
    }
  }

  /**
   * Asserts that the caller is a member of the target group.
   *
   * Throws `FORBIDDEN` when the membership check fails.
   */
  static assertGroupMembership(isMember: boolean): void {
    if (!isMember) {
      throw Object.assign(new Error('You must be a member of the target group'), {
        code: 'FORBIDDEN',
      });
    }
  }
}
