import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventDraftRepositoryPort } from '../domain/event-draft.repository.port.js';
import type { EventDraft } from '../domain/event-draft.js';

/**
 * Returns a specific draft belonging to the caller.
 * Returns NOT_FOUND if the draft does not exist or belongs to another user.
 */
export class GetDraftUseCase {
  constructor(private readonly draftRepo: EventDraftRepositoryPort) {}

  async execute(caller: IdentityContext, draftId: string): Promise<EventDraft> {
    const draft = await this.draftRepo.findById(draftId);
    if (!draft || draft.createdByUserId !== caller.userId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    return draft;
  }
}
