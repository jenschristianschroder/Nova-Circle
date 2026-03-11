import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventDraftRepositoryPort } from '../domain/event-draft.repository.port.js';
import type { EventDraft } from '../domain/event-draft.js';

/**
 * Returns all drafts belonging to the caller, ordered newest first.
 * Only returns drafts with status 'pending_review'.
 */
export class ListDraftsUseCase {
  constructor(private readonly draftRepo: EventDraftRepositoryPort) {}

  async execute(caller: IdentityContext): Promise<EventDraft[]> {
    return this.draftRepo.listByUser(caller.userId);
  }
}
