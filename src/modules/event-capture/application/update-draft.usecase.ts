import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { EventDraftRepositoryPort } from '../domain/event-draft.repository.port.js';
import type { CapturePipelineService } from './capture-pipeline.service.js';
import { tryParseDateTime } from './capture-pipeline.service.js';
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
    const mergedTitle = command.title !== undefined ? command.title : draft.candidateTitle;
    const mergedDescription =
      command.description !== undefined ? command.description : draft.candidateDescription;
    const mergedGroupId = command.groupId !== undefined ? command.groupId : draft.groupId;

    // Parse user-supplied datetime strings. Throw VALIDATION_ERROR for non-null strings
    // that are not valid ISO 8601 datetimes-with-time so callers receive an actionable 400
    // rather than a silent null that becomes a missing_start_date issue.
    let mergedStartAt: Date | null;
    if (command.startAt !== undefined) {
      if (command.startAt === null) {
        mergedStartAt = null;
      } else {
        const parsed = tryParseDateTime(command.startAt);
        if (parsed === null) {
          throw Object.assign(
            new Error(
              'startAt must be a valid ISO 8601 datetime string with time (e.g. "2026-06-01T12:00:00Z")',
            ),
            { code: 'VALIDATION_ERROR' },
          );
        }
        mergedStartAt = parsed;
      }
    } else {
      mergedStartAt = draft.candidateStartAt;
    }

    let mergedEndAt: Date | null;
    if (command.endAt !== undefined) {
      if (command.endAt === null) {
        mergedEndAt = null;
      } else {
        const parsed = tryParseDateTime(command.endAt);
        if (parsed === null) {
          throw Object.assign(
            new Error(
              'endAt must be a valid ISO 8601 datetime string with time (e.g. "2026-06-01T13:00:00Z")',
            ),
            { code: 'VALIDATION_ERROR' },
          );
        }
        mergedEndAt = parsed;
      }
    } else {
      mergedEndAt = draft.candidateEndAt;
    }

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
