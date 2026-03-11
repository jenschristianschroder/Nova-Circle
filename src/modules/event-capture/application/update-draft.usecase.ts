import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventDraftRepositoryPort } from '../domain/event-draft.repository.port.js';
import type { CapturePipelineService } from './capture-pipeline.service.js';
import type { EventDraft } from '../domain/event-draft.js';

export interface UpdateDraftCommand {
  readonly draftId: string;
  readonly groupId?: string | null;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly startAt?: string | null;
  readonly endAt?: string | null;
}

/**
 * Updates candidate fields on a pending draft and re-runs validation.
 * If all issues are resolved after the update, the draft remains in 'pending_review' status
 * with an empty issues array; the caller can then use PromoteDraftUseCase to create the event.
 *
 * Returns NOT_FOUND if the draft does not exist or belongs to another user.
 * Returns CONFLICT if the draft is not in 'pending_review' status.
 */
export class UpdateDraftUseCase {
  constructor(
    private readonly draftRepo: EventDraftRepositoryPort,
    private readonly pipeline: CapturePipelineService,
  ) {}

  async execute(caller: IdentityContext, command: UpdateDraftCommand): Promise<EventDraft> {
    const draft = await this.draftRepo.findById(command.draftId);
    if (!draft || draft.createdByUserId !== caller.userId) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    if (draft.status !== 'pending_review') {
      throw Object.assign(
        new Error('Draft is not in pending_review status and cannot be updated'),
        { code: 'CONFLICT' },
      );
    }

    // Merge supplied values with existing candidate values.
    const mergedTitle =
      command.title !== undefined ? command.title : draft.candidateTitle;
    const mergedDescription =
      command.description !== undefined ? command.description : draft.candidateDescription;
    const mergedGroupId =
      command.groupId !== undefined ? command.groupId : draft.groupId;

    const { tryParseDateTime } = await import('./capture-pipeline.service.js');
    const mergedStartAt =
      command.startAt !== undefined
        ? (command.startAt ? tryParseDateTime(command.startAt) : null)
        : draft.candidateStartAt;
    const mergedEndAt =
      command.endAt !== undefined
        ? (command.endAt ? tryParseDateTime(command.endAt) : null)
        : draft.candidateEndAt;

    // Re-run validation with the merged candidates.
    const { issues, resolvedGroupId } = await this.pipeline.revalidate(caller, {
      title: mergedTitle,
      description: mergedDescription,
      startAt: mergedStartAt,
      endAt: mergedEndAt,
      groupId: mergedGroupId,
    });

    const updated = await this.draftRepo.updateCandidates(command.draftId, {
      groupId: resolvedGroupId,
      candidateTitle: mergedTitle,
      candidateDescription: mergedDescription,
      candidateStartAt: mergedStartAt,
      candidateEndAt: mergedEndAt,
      issues,
    });

    if (!updated) {
      throw Object.assign(new Error('Not found'), { code: 'NOT_FOUND' });
    }
    return updated;
  }
}
