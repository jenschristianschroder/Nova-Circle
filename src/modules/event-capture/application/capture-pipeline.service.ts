import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { IEventFieldExtractor, CandidateEventFields } from './event-field-extractor.port.js';
import type { EventDraftRepositoryPort } from '../domain/event-draft.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventCreationPort } from '../../event-management/domain/event-creation.port.js';
import type { EventDraft, DraftIssue, RawInputType } from '../domain/event-draft.js';

/**
 * Minimum confidence score required to promote a candidate field to a real value.
 * Fields below this threshold are flagged with low_confidence_extraction.
 */
const CONFIDENCE_THRESHOLD = 0.7;

/** Returned when the pipeline produces a saved event. */
export interface CaptureEventResult {
  readonly type: 'event';
  readonly eventId: string;
}

/** Returned when the pipeline produces a draft due to missing or low-confidence fields. */
export interface CaptureDraftResult {
  readonly type: 'draft';
  readonly draft: EventDraft;
}

export type CaptureResult = CaptureEventResult | CaptureDraftResult;

/**
 * Input to the shared pipeline after normalization.
 * Applies to text, voice (after transcription), and image (after extraction) input types.
 */
export interface PipelineInput {
  /** Normalized text content. Empty string if image yielded no text. */
  readonly text: string;
  /** Explicitly provided group ID from the request body. May be null. */
  readonly groupId: string | null;
  readonly rawInputType: RawInputType;
  readonly audioBlobReference: string | null;
  readonly imageBlobReference: string | null;
  /**
   * For image input, candidate fields may already be available from the extraction step.
   * If provided, they are merged with field extraction results (pre-extracted fields take precedence).
   */
  readonly preExtractedFields?: CandidateEventFields;
}

/**
 * Attempts to parse a datetime string deterministically.
 * Returns a Date if the string is a valid ISO 8601 datetime; null otherwise.
 *
 * Uses only JavaScript's built-in Date.parse – no AI or external service is called.
 */
export function tryParseDateTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (isNaN(ms)) return null;
  return new Date(ms);
}

/**
 * Shared capture pipeline service.
 *
 * Steps:
 *  3. Extract candidate fields from normalized text.
 *  4. Deterministically parse dates and times.
 *  5. Validate business rules.
 *  6. Route: if all valid → create event via event-management; else → persist EventDraft.
 *
 * This service is called by CaptureTextUseCase, CaptureVoiceUseCase, and CaptureImageUseCase
 * after each has completed their input-type-specific normalization (steps 1–2).
 */
export class CapturePipelineService {
  constructor(
    private readonly extractor: IEventFieldExtractor,
    private readonly draftRepo: EventDraftRepositoryPort,
    private readonly eventCreator: EventCreationPort,
    private readonly memberRepo: GroupMemberRepositoryPort,
  ) {}

  async run(caller: IdentityContext, input: PipelineInput): Promise<CaptureResult> {
    // Step 3: Extract candidate fields.
    let candidates = await this.extractor.extractFromText(input.text);

    // Merge pre-extracted fields (from image extraction) – pre-extracted fields take precedence.
    if (input.preExtractedFields) {
      candidates = mergeCandidates(input.preExtractedFields, candidates);
    }

    // Step 4: Deterministic parse of dates.
    const parsedStart =
      candidates.startDateTime ? tryParseDateTime(candidates.startDateTime.value) : null;
    const parsedEnd =
      candidates.endDateTime ? tryParseDateTime(candidates.endDateTime.value) : null;

    // Step 5: Validate.
    const issues: DraftIssue[] = [];

    // Title validation.
    if (!candidates.title) {
      issues.push({ code: 'missing_title', field: 'title', message: 'No title could be extracted from the input' });
    } else if (candidates.title.confidence < CONFIDENCE_THRESHOLD) {
      issues.push({ code: 'low_confidence_extraction', field: 'title', message: 'Title extraction confidence is too low to create an event' });
    } else if (!candidates.title.value.trim()) {
      issues.push({ code: 'missing_title', field: 'title', message: 'No title could be extracted from the input' });
    }

    // Start date/time validation.
    if (!candidates.startDateTime) {
      issues.push({ code: 'missing_start_date', field: 'startAt', message: 'No start date or time could be determined from the input' });
    } else if (parsedStart === null) {
      issues.push({ code: 'ambiguous_date', field: 'startAt', message: 'Start date or time could not be parsed deterministically' });
    } else if (candidates.startDateTime.confidence < CONFIDENCE_THRESHOLD) {
      issues.push({ code: 'low_confidence_extraction', field: 'startAt', message: 'Start date/time extraction confidence is too low' });
    }

    // End time validation (only if start was parsed and end is present).
    if (candidates.endDateTime && parsedEnd === null) {
      issues.push({ code: 'ambiguous_time', field: 'endAt', message: 'End date or time could not be parsed deterministically' });
    } else if (parsedStart !== null && parsedEnd !== null && parsedEnd <= parsedStart) {
      issues.push({ code: 'invalid_time_range', field: 'endAt', message: 'End time must be after start time' });
    }

    // Group validation.
    let resolvedGroupId = input.groupId;

    if (!resolvedGroupId) {
      issues.push({ code: 'missing_group', field: 'groupId', message: 'No group could be identified from the input' });
    } else {
      const isMember = await this.memberRepo.isMember(resolvedGroupId, caller.userId);
      if (!isMember) {
        issues.push({ code: 'unauthorized_group_access', field: 'groupId', message: 'You are not a member of the specified group' });
        // Clear groupId to avoid persisting an inaccessible group reference.
        resolvedGroupId = null;
      }
    }

    // Step 6: Route.
    if (issues.length === 0 && resolvedGroupId && parsedStart) {
      // All required fields are valid – delegate to event-management.
      const memberList = await this.memberRepo.listByGroup(resolvedGroupId);
      const inviteeIds = memberList.map((m) => m.userId);
      if (!inviteeIds.includes(caller.userId)) {
        inviteeIds.push(caller.userId);
      }

      const hasValidTimeRange = !issues.some((i) => i.code === 'invalid_time_range');
      const event = await this.eventCreator.createEventWithInvitations({
        groupId: resolvedGroupId,
        title: candidates.title!.value.trim(),
        description: candidates.description?.value ?? null,
        startAt: parsedStart,
        endAt: (parsedEnd && hasValidTimeRange) ? parsedEnd : null,
        createdBy: caller.userId,
        inviteeIds,
      });

      return { type: 'event', eventId: event.id };
    }

    // Persist an EventDraft with structured issue codes.
    const draft = await this.draftRepo.create({
      createdByUserId: caller.userId,
      groupId: resolvedGroupId,
      rawInputType: input.rawInputType,
      rawTextContent: input.text || null,
      audioBlobReference: input.audioBlobReference,
      imageBlobReference: input.imageBlobReference,
      candidateTitle: candidates.title?.value ?? null,
      candidateDescription: candidates.description?.value ?? null,
      candidateStartAt: parsedStart,
      candidateEndAt: parsedEnd,
      issues,
    });

    return { type: 'draft', draft };
  }

  /**
   * Re-runs validation (steps 5–6) on an existing draft with updated candidate fields.
   * Used by UpdateDraftUseCase and PromoteDraftUseCase.
   */
  async revalidate(
    caller: IdentityContext,
    candidates: {
      title: string | null;
      description: string | null;
      startAt: Date | null;
      endAt: Date | null;
      groupId: string | null;
    },
  ): Promise<{ issues: DraftIssue[]; resolvedGroupId: string | null }> {
    const issues: DraftIssue[] = [];

    // Title.
    if (!candidates.title || !candidates.title.trim()) {
      issues.push({ code: 'missing_title', field: 'title', message: 'Title is required' });
    }

    // Start.
    if (!candidates.startAt) {
      issues.push({ code: 'missing_start_date', field: 'startAt', message: 'Start date is required' });
    }

    // End.
    if (candidates.startAt && candidates.endAt && candidates.endAt <= candidates.startAt) {
      issues.push({ code: 'invalid_time_range', field: 'endAt', message: 'End time must be after start time' });
    }

    // Group.
    let resolvedGroupId = candidates.groupId;
    if (!resolvedGroupId) {
      issues.push({ code: 'missing_group', field: 'groupId', message: 'A group is required' });
    } else {
      const isMember = await this.memberRepo.isMember(resolvedGroupId, caller.userId);
      if (!isMember) {
        issues.push({ code: 'unauthorized_group_access', field: 'groupId', message: 'You are not a member of the specified group' });
        resolvedGroupId = null;
      }
    }

    return { issues, resolvedGroupId };
  }
}

/**
 * Merges two CandidateEventFields objects.
 * Fields in `primary` take precedence over fields in `fallback`.
 */
function mergeCandidates(
  primary: CandidateEventFields,
  fallback: CandidateEventFields,
): CandidateEventFields {
  const title = primary.title ?? fallback.title;
  const description = primary.description ?? fallback.description;
  const startDateTime = primary.startDateTime ?? fallback.startDateTime;
  const endDateTime = primary.endDateTime ?? fallback.endDateTime;
  const durationMinutes = primary.durationMinutes ?? fallback.durationMinutes;
  const groupName = primary.groupName ?? fallback.groupName;

  return {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(startDateTime !== undefined && { startDateTime }),
    ...(endDateTime !== undefined && { endDateTime }),
    ...(durationMinutes !== undefined && { durationMinutes }),
    ...(groupName !== undefined && { groupName }),
  };
}
