import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventRepositoryPort } from '../domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../domain/event-invitation.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { AuditLogPort, AuditAction } from '../../audit-security/index.js';
import type { Event } from '../domain/event.js';

export interface EditEventCommand {
  readonly title?: string;
  readonly description?: string | null;
  readonly startAt?: Date;
  readonly endAt?: Date | null;
}

export class EditEventUseCase {
  constructor(
    private readonly eventRepo: EventRepositoryPort,
    private readonly invitationRepo: EventInvitationRepositoryPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
    private readonly auditLog: AuditLogPort,
  ) {}

  async execute(
    caller: IdentityContext,
    groupId: string,
    eventId: string,
    command: EditEventCommand,
  ): Promise<Event> {
    const event = await this.eventRepo.findById(eventId);
    if (!event || event.groupId !== groupId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Group owners and admins can edit any event in their group even without
    // an invitation. For everyone else an active invitation is required so
    // that the event's existence is not disclosed to non-invited callers.
    const role = await this.memberRepo.getRole(groupId, caller.userId);
    const isAdminOrOwner = role === 'owner' || role === 'admin';

    if (!isAdminOrOwner) {
      const hasAccess = await this.invitationRepo.hasAccess(eventId, caller.userId);
      if (!hasAccess) {
        throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
      }
    }

    // Only the creator or a group admin/owner can edit.
    const isCreator = event.createdBy === caller.userId;
    if (!isCreator && !isAdminOrOwner) {
      throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' });
    }

    // Do not allow editing events that have already been cancelled.
    if (event.status === 'cancelled') {
      throw Object.assign(new Error('Cannot edit a cancelled event'), { code: 'CONFLICT' });
    }

    // Validate fields when provided.
    const trimmedTitle = command.title !== undefined ? command.title.trim() : undefined;
    if (trimmedTitle !== undefined) {
      if (trimmedTitle.length === 0) {
        throw Object.assign(new Error('Event title must not be empty'), {
          code: 'VALIDATION_ERROR',
        });
      }
      if (trimmedTitle.length > 200) {
        throw Object.assign(new Error('Event title must not exceed 200 characters'), {
          code: 'VALIDATION_ERROR',
        });
      }
    }

    const resolvedStartAt = command.startAt ?? event.startAt;
    const resolvedEndAt = command.endAt !== undefined ? command.endAt : event.endAt;

    if (resolvedEndAt != null && resolvedEndAt <= resolvedStartAt) {
      throw Object.assign(new Error('End time must be after start time'), {
        code: 'VALIDATION_ERROR',
      });
    }

    const updated = await this.eventRepo.update(eventId, {
      ...(trimmedTitle !== undefined ? { title: trimmedTitle } : {}),
      ...(command.description !== undefined ? { description: command.description } : {}),
      ...(command.startAt !== undefined ? { startAt: command.startAt } : {}),
      ...(command.endAt !== undefined ? { endAt: command.endAt } : {}),
    });

    if (!updated) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }

    // Audit logging is best-effort: do not fail the operation after a successful update.
    try {
      await this.auditLog.record({
        actorId: caller.userId,
        // 'event.updated' will be added to AuditAction once the shared type is extended.
        action: 'event.updated' as AuditAction,
        resourceType: 'event',
        resourceId: eventId,
        groupId,
        metadata: {
          changedFields: Object.keys(command).filter(
            (k) => command[k as keyof EditEventCommand] !== undefined,
          ),
        },
      });
    } catch {
      // Intentionally swallow audit logging failures to avoid inconsistent API outcomes.
    }

    return updated;
  }
}
