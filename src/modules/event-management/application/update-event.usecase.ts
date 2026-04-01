import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { Event, UpdateEventData } from '../domain/event.js';
import { EventOwnershipPolicy } from '../domain/event-ownership-policy.js';

export class UpdateEventUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(
    caller: IdentityContext,
    groupId: string,
    eventId: string,
    data: UpdateEventData,
  ): Promise<Event> {
    const event = await this.eventRepo.findById(eventId);
    if (!event || event.groupId !== groupId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Group owners and admins can edit any event in their group even without
    // an invitation.  For everyone else an active invitation is required so
    // that the event's existence is not disclosed to non-invited callers.
    const role = await this.memberRepo.getRole(groupId, caller.userId);
    const isAdminOrOwner = role === 'owner' || role === 'admin';

    if (!isAdminOrOwner) {
      const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
      if (!hasAccess) {
        throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
      }
    }

    if (event.status === 'cancelled') {
      throw Object.assign(new Error('Cannot edit a cancelled event'), { code: 'CONFLICT' });
    }

    // Only the creator or a group admin/owner can edit.
    const isCreator = event.createdBy === caller.userId;
    if (!isCreator && !isAdminOrOwner) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
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

    // Validate time range using the effective start/end after the patch.
    const effectiveStart = data.startAt ?? event.startAt;
    const effectiveEnd = data.endAt !== undefined ? data.endAt : event.endAt;
    if (effectiveEnd != null && effectiveEnd <= effectiveStart) {
      throw Object.assign(new Error('End time must be after start time'), {
        code: 'VALIDATION_ERROR',
      });
    }

    // Sanitize update data to prevent ownership changes at runtime.
    const patchData: UpdateEventData = EventOwnershipPolicy.sanitizeUpdateData({
      ...data,
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
    });

    const updated = await this.eventRepo.update(eventId, patchData);
    if (!updated) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    return updated;
  }
}
