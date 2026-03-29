import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventCreationPort } from '../domain/event-creation.port.js';
import type { Event } from '../domain/event.js';

export interface CreatePersonalEventCommand {
  readonly title: string;
  readonly description?: string | null;
  readonly startAt: Date;
  readonly endAt?: Date | null;
}

export class CreatePersonalEventUseCase {
  constructor(private readonly eventCreator: EventCreationPort) {}

  async execute(caller: IdentityContext, command: CreatePersonalEventCommand): Promise<Event> {
    const trimmed = command.title.trim();
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

    if (command.endAt != null && command.endAt <= command.startAt) {
      throw Object.assign(new Error('End time must be after start time'), {
        code: 'VALIDATION_ERROR',
      });
    }

    return this.eventCreator.createEventWithInvitations({
      groupId: null,
      title: trimmed,
      description: command.description ?? null,
      startAt: command.startAt,
      endAt: command.endAt ?? null,
      createdBy: caller.userId,
      inviteeIds: [caller.userId],
    });
  }
}
