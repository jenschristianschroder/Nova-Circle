import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventCreationPort } from '../domain/event-creation.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { Event } from '../domain/event.js';

export interface CreateEventCommand {
  readonly groupId: string;
  readonly title: string;
  readonly description?: string | null;
  readonly startAt: Date;
  readonly endAt?: Date | null;
  /**
   * User IDs to exclude from the default invite list.
   * The creator can never be excluded.
   */
  readonly excludeUserIds?: ReadonlyArray<string>;
}

export class CreateEventUseCase {
  constructor(
    private readonly eventCreator: EventCreationPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(caller: IdentityContext, command: CreateEventCommand): Promise<Event> {
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

    // Caller must be a member of the group to create an event.
    const isMember = await this.memberRepo.isMember(command.groupId, caller.userId);
    if (!isMember) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Snapshot current group membership.
    const currentMembers = await this.memberRepo.listByGroup(command.groupId);

    const excludeSet = new Set(command.excludeUserIds ?? []);
    // The creator is always invited regardless of excludeUserIds.
    excludeSet.delete(caller.userId);

    const inviteeIds = currentMembers.map((m) => m.userId).filter((uid) => !excludeSet.has(uid));

    // Ensure creator is in the list even if they were not in the member snapshot (edge case).
    if (!inviteeIds.includes(caller.userId)) {
      inviteeIds.push(caller.userId);
    }

    return this.eventCreator.createEventWithInvitations({
      groupId: command.groupId,
      title: trimmed,
      description: command.description ?? null,
      startAt: command.startAt,
      endAt: command.endAt ?? null,
      createdBy: caller.userId,
      inviteeIds,
    });
  }
}
