import type { IdentityContext } from '../../../shared/auth/identity-context.js';
import type { IEventFieldExtractor, CandidateEventFields } from './event-field-extractor.port.js';
import type { EventDraftRepositoryPort } from '../domain/event-draft.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventCreationPort } from '../../event-management/domain/event-creation.port.js';
import type { EventDraft, DraftIssue, RawInputType } from '../domain/event-draft.js';
import { isValidUuid } from '../../../shared/validation/uuid.js';

/**
 * Minimum confidence score required to promote a candidate field to a real value.
 * Fields below this threshold are flagged with low_confidence_extraction.
 */
const CONFIDENCE_THRESHOLD = 0.7;

/** Maximum allowed length for an event title. Mirrors the DB constraint on events.title. */
const TITLE_MAX_LENGTH = 200;

/**
 * Strict ISO 8601 datetime-with-time regex.
 * Accepts: YYYY-MM-DDThh:mm[:ss][.SSS](Z|±hh:mm)
 * Rejects date-only strings (e.g. "2026-06-01") so callers get explicit issue codes
 * (ambiguous_date / missing_start_time) rather than silent midnight-UTC coercions.
 */
const ISO_DATETIME_WITH_TIME_REGEX =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(?::[0-9]{2})?(?:\.[0-9]{1,3})?(Z|[+-][0-9]{2}:[0-9]{2})$/;

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
 * Returns a Date only for strict ISO 8601 datetime strings that include a time component
 * (e.g. "2026-06-01T12:00:00Z" or "2026-06-01T14:00:00+02:00"). Returns null otherwise.
 *
 * Date-only values (e.g. "2026-06-01") are intentionally rejected so callers can
 * surface explicit ambiguous_date / missing_start_time issue codes rather than
 * silently coercing them to midnight UTC.
 *
 * Behavior is deterministic across runtimes because only ISO 8601 datetimes are
 * accepted – no locale-dependent or browser-specific parsing paths are used.
 */
export function tryParseDateTime(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!ISO_DATETIME_WITH_TIME_REGEX.test(trimmed)) return null;
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) return null;
  return date;
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
    const parsedStart = candidates.startDateTime
      ? tryParseDateTime(candidates.startDateTime.value)
      : null;
    const parsedEnd = candidates.endDateTime
      ? tryParseDateTime(candidates.endDateTime.value)
      : null;

    // Step 5: Validate.
    const issues: DraftIssue[] = [];

    // Title validation.
    if (!candidates.title) {
      issues.push({
        code: 'missing_title',
        field: 'title',
        message: 'No title could be extracted from the input',
      });
    } else if (candidates.title.confidence < CONFIDENCE_THRESHOLD) {
      issues.push({
        code: 'low_confidence_extraction',
        field: 'title',
        message: 'Title extraction confidence is too low to create an event',
      });
    } else if (!candidates.title.value.trim()) {
      issues.push({
        code: 'missing_title',
        field: 'title',
        message: 'No title could be extracted from the input',
      });
    } else if (candidates.title.value.trim().length > TITLE_MAX_LENGTH) {
      issues.push({
        code: 'title_too_long',
        field: 'title',
        message: `Event title must not exceed ${TITLE_MAX_LENGTH} characters`,
      });
    }

    // Start date/time validation.
    if (!candidates.startDateTime) {
      issues.push({
        code: 'missing_start_date',
        field: 'startAt',
        message: 'No start date or time could be determined from the input',
      });
    } else if (parsedStart === null) {
      issues.push({
        code: 'ambiguous_date',
        field: 'startAt',
        message: 'Start date or time could not be parsed deterministically',
      });
    } else if (candidates.startDateTime.confidence < CONFIDENCE_THRESHOLD) {
      issues.push({
        code: 'low_confidence_extraction',
        field: 'startAt',
        message: 'Start date/time extraction confidence is too low',
      });
    }

    // End time validation (only if start was parsed and end is present).
    if (candidates.endDateTime && parsedEnd === null) {
      issues.push({
        code: 'ambiguous_time',
        field: 'endAt',
        message: 'End date or time could not be parsed deterministically',
      });
    } else if (parsedStart !== null && parsedEnd !== null && parsedEnd <= parsedStart) {
      issues.push({
        code: 'invalid_time_range',
        field: 'endAt',
        message: 'End time must be after start time',
      });
    }

    // Group validation — only required for group-scoped events.
    // When no groupId is provided, a personal event will be created instead.
    let resolvedGroupId = input.groupId;

    if (resolvedGroupId) {
      if (!isValidUuid(resolvedGroupId)) {
        // An invalid UUID would cause a PostgreSQL cast error; treat as unauthorized access.
        issues.push({
          code: 'unauthorized_group_access',
          field: 'groupId',
          message: 'Invalid group identifier',
        });
        resolvedGroupId = null;
      } else {
        const isMember = await this.memberRepo.isMember(resolvedGroupId, caller.userId);
        if (!isMember) {
          issues.push({
            code: 'unauthorized_group_access',
            field: 'groupId',
            message: 'You are not a member of the specified group',
          });
          // Clear groupId to avoid persisting an inaccessible group reference.
          resolvedGroupId = null;
        }
      }
    }

    // Step 6: Route.
    if (issues.length === 0 && parsedStart) {
      const hasValidTimeRange = !issues.some((i) => i.code === 'invalid_time_range');
      const resolvedEndAt = parsedEnd && hasValidTimeRange ? parsedEnd : null;

      if (resolvedGroupId) {
        // Group-scoped event – delegate to event-management with invitees.
        const memberList = await this.memberRepo.listByGroup(resolvedGroupId);
        const inviteeIds = memberList.map((m) => m.userId);
        if (!inviteeIds.includes(caller.userId)) {
          inviteeIds.push(caller.userId);
        }

        const event = await this.eventCreator.createEventWithInvitations({
          groupId: resolvedGroupId,
          title: candidates.title!.value.trim(),
          description: candidates.description?.value ?? null,
          startAt: parsedStart,
          endAt: resolvedEndAt,
          createdBy: caller.userId,
          inviteeIds,
        });

        return { type: 'event', eventId: event.id };
      } else {
        // Personal event – no group, no invitations.
        const event = await this.eventCreator.createEventWithInvitations({
          groupId: null,
          title: candidates.title!.value.trim(),
          description: candidates.description?.value ?? null,
          startAt: parsedStart,
          endAt: resolvedEndAt,
          createdBy: caller.userId,
          inviteeIds: [],
        });

        return { type: 'event', eventId: event.id };
      }
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
    } else if (candidates.title.trim().length > TITLE_MAX_LENGTH) {
      issues.push({
        code: 'title_too_long',
        field: 'title',
        message: `Event title must not exceed ${TITLE_MAX_LENGTH} characters`,
      });
    }

    // Start.
    if (!candidates.startAt) {
      issues.push({
        code: 'missing_start_date',
        field: 'startAt',
        message: 'Start date is required',
      });
    }

    // End.
    if (candidates.startAt && candidates.endAt && candidates.endAt <= candidates.startAt) {
      issues.push({
        code: 'invalid_time_range',
        field: 'endAt',
        message: 'End time must be after start time',
      });
    }

    // Group — only validate if provided; omitting means personal event.
    let resolvedGroupId = candidates.groupId;
    if (resolvedGroupId) {
      if (!isValidUuid(resolvedGroupId)) {
        issues.push({
          code: 'unauthorized_group_access',
          field: 'groupId',
          message: 'Invalid group identifier',
        });
        resolvedGroupId = null;
      } else {
        const isMember = await this.memberRepo.isMember(resolvedGroupId, caller.userId);
        if (!isMember) {
          issues.push({
            code: 'unauthorized_group_access',
            field: 'groupId',
            message: 'You are not a member of the specified group',
          });
          resolvedGroupId = null;
        }
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
