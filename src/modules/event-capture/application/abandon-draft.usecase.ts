import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventDraftRepositoryPort } from '../domain/event-draft.repository.port.js';
import type { EventDraft } from '../domain/event-draft.js';

/**
 * Marks a draft as abandoned.
 *
 * Returns NOT_FOUND if the draft does not exist or belongs to another user.
 * Returns CONFLICT if the draft is not in 'pending_review' status (already promoted or abandoned).
 */
export class AbandonDraftUseCase {
  constructor(private readonly draftRepo: EventDraftRepositoryPort) {}

  async execute(caller: IdentityContext, draftId: string): Promise<EventDraft> {
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

    const abandoned = await this.draftRepo.abandon(draftId);
    if (!abandoned) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    return abandoned;
  }
}
