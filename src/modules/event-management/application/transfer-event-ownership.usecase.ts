import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { Event } from '../domain/event.js';
import { EventOwnershipPolicy } from '../domain/event-ownership-policy.js';
import { isForeignKeyViolation } from '../../../shared/database/pg-errors.js';

export interface TransferOwnershipResult {
  readonly event: Event;
  readonly previousOwnerId: string;
}

export class TransferEventOwnershipUseCase {
  constructor(private readonly eventRepo: EventRepositoryPort) {}

  async execute(
    caller: IdentityContext,
    eventId: string,
    newOwnerId: string,
  ): Promise<TransferOwnershipResult> {
    const event = await this.eventRepo.findById(eventId);

    // Explicit ownership authorization via centralised policy.
    EventOwnershipPolicy.assertCallerIsOwner(event, caller);

    // This use case is for personal (non-group) events only.
    if (event.groupId !== null) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    if (event.status === 'cancelled') {
      throw Object.assign(new Error('Cannot transfer ownership of a cancelled event'), {
        code: 'CONFLICT',
      });
    }

    if (newOwnerId === event.ownerId) {
      throw Object.assign(new Error('New owner must be different from the current owner'), {
        code: 'VALIDATION_ERROR',
      });
    }

    const previousOwnerId = event.ownerId;

    let updated: Event | null;
    try {
      updated = await this.eventRepo.transferOwnership(eventId, newOwnerId, previousOwnerId);
    } catch (error: unknown) {
      if (isForeignKeyViolation(error)) {
        throw Object.assign(new Error('New owner does not exist'), {
          code: 'VALIDATION_ERROR',
        });
      }
      throw error;
    }
    if (!updated) {
      // 0 rows updated → concurrent transfer changed the owner between our
      // read and the conditional update (TOCTOU). Surface as CONFLICT.
      throw Object.assign(new Error('Event ownership has changed concurrently'), {
        code: 'CONFLICT',
      });
    }
    return { event: updated, previousOwnerId };
  }
}
