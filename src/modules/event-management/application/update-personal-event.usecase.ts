import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { Event, UpdateEventData } from '../domain/event.js';

export class UpdatePersonalEventUseCase {
  constructor(private readonly eventRepo: EventRepositoryPort) {}

  async execute(caller: IdentityContext, eventId: string, data: UpdateEventData): Promise<Event> {
    const event = await this.eventRepo.findById(eventId);
    if (!event) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Only the owner can update their personal event.
    if (event.ownerId !== caller.userId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // This use case is for personal (non-group) events only.
    if (event.groupId !== null) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    if (event.status === 'cancelled') {
      throw Object.assign(new Error('Cannot edit a cancelled event'), { code: 'CONFLICT' });
    }

    if (data.title !== undefined) {
      const trimmed = data.title.trim();
      if (trimmed.length === 0) {
        throw Object.assign(new Error('Event title must not be empty'), {
          code: 'VALIDATION_ERROR',
        });
      }
      if (trimmed.length > 200) {
        throw Object.assign(new Error('Event title must not exceed 200 characters'), {
          code: 'VALIDATION_ERROR',
        });
      }
    }

    const effectiveStart = data.startAt ?? event.startAt;
    const effectiveEnd = data.endAt !== undefined ? data.endAt : event.endAt;
    if (effectiveEnd != null && effectiveEnd <= effectiveStart) {
      throw Object.assign(new Error('End time must be after start time'), {
        code: 'VALIDATION_ERROR',
      });
    }

    const patchData: UpdateEventData = {
      ...data,
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
    };

    const updated = await this.eventRepo.update(eventId, patchData);
    if (!updated) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    return updated;
  }
}
