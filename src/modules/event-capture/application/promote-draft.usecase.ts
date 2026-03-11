import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventDraftRepositoryPort } from '../domain/event-draft.repository.port.js';
import type { EventCreationPort } from '../../event-management/domain/event-creation.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';

export interface PromoteDraftResult {
  readonly eventId: string;
}

/**
 * Promotes a fully resolved draft to a saved event via event-management.
 *
 * Checks that all issues have been resolved (issues array is empty) before dispatching
 * CreateEventWithInvitations. If issues remain, returns CONFLICT so the caller can correct them.
 *
 * Returns NOT_FOUND if the draft does not exist or belongs to another user.
 * Returns CONFLICT if the draft still has unresolved issues or is not in 'pending_review' status.
 */
export class PromoteDraftUseCase {
  constructor(
    private readonly draftRepo: EventDraftRepositoryPort,
    private readonly eventCreator: EventCreationPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async execute(caller: IdentityContext, draftId: string): Promise<PromoteDraftResult> {
    const draft = await this.draftRepo.findById(draftId);
    if (!draft || draft.createdByUserId !== caller.userId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    if (draft.status !== 'pending_review') {
      throw Object.assign(
        new Error('Draft is not in pending_review status'),
        { code: 'CONFLICT' },
      );
    }
    if (draft.issues.length > 0) {
      throw Object.assign(
        new Error('Draft still has unresolved issues and cannot be promoted'),
        { code: 'CONFLICT' },
      );
    }
    if (!draft.candidateTitle || !draft.candidateStartAt || !draft.groupId) {
      throw Object.assign(
        new Error('Draft is missing required fields (title, startAt, or groupId)'),
        { code: 'CONFLICT' },
      );
    }

    // Snapshot group membership at promotion time.
    const memberList = await this.memberRepo.listByGroup(draft.groupId);
    const inviteeIds = memberList.map((m) => m.userId);
    if (!inviteeIds.includes(caller.userId)) {
      inviteeIds.push(caller.userId);
    }

    const event = await this.eventCreator.createEventWithInvitations({
      groupId: draft.groupId,
      title: draft.candidateTitle.trim(),
      description: draft.candidateDescription ?? null,
      startAt: draft.candidateStartAt,
      endAt: draft.candidateEndAt ?? null,
      createdBy: caller.userId,
      inviteeIds,
    });

    await this.draftRepo.promote(draftId);

    return { eventId: event.id };
  }
}
