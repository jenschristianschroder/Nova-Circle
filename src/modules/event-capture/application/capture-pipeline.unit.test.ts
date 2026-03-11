import { describe, it, expect, vi } from 'vitest';
import { CapturePipelineService, tryParseDateTime } from './capture-pipeline.service.js';
import { CaptureTextUseCase } from './capture-text.usecase.js';
import { CaptureVoiceUseCase } from './capture-voice.usecase.js';
import { CaptureImageUseCase } from './capture-image.usecase.js';
import { UpdateDraftUseCase } from './update-draft.usecase.js';
import { PromoteDraftUseCase } from './promote-draft.usecase.js';
import { AbandonDraftUseCase } from './abandon-draft.usecase.js';
import type { IEventFieldExtractor, CandidateEventFields } from './event-field-extractor.port.js';
import type { ISpeechToTextAdapter } from './speech-to-text.port.js';
import type { IImageExtractionAdapter } from './image-extraction.port.js';
import type { EventDraftRepositoryPort } from '../domain/event-draft.repository.port.js';
import type { EventCreationPort } from '../../event-management/domain/event-creation.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { EventDraft } from '../domain/event-draft.js';
import type { Event } from '../../event-management/domain/event.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GROUP_ID = '00000000-0000-4000-8000-000000000001';

function makeEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'event-1',
    groupId: GROUP_ID,
    title: 'Team Lunch',
    description: null,
    startAt: new Date('2026-06-01T12:00:00Z'),
    endAt: null,
    createdBy: 'creator-id',
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeDraft(overrides?: Partial<EventDraft>): EventDraft {
  return {
    id: 'draft-1',
    createdByUserId: 'user-1',
    groupId: GROUP_ID,
    rawInputType: 'text',
    rawTextContent: 'Team lunch tomorrow at noon',
    audioBlobReference: null,
    imageBlobReference: null,
    candidateTitle: 'Team Lunch',
    candidateDescription: null,
    candidateStartAt: new Date('2026-06-01T12:00:00Z'),
    candidateEndAt: null,
    issues: [],
    status: 'pending_review',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeExtractor(fields: CandidateEventFields): IEventFieldExtractor {
  return { extractFromText: vi.fn().mockResolvedValue(fields) };
}

function makeDraftRepo(overrides?: Partial<EventDraftRepositoryPort>): EventDraftRepositoryPort {
  return {
    create: vi.fn().mockImplementation((data: Parameters<EventDraftRepositoryPort['create']>[0]) =>
      Promise.resolve({ ...makeDraft(), ...data, id: 'draft-1', status: 'pending_review', createdAt: new Date(), updatedAt: new Date() }),
    ),
    findById: vi.fn().mockResolvedValue(null),
    listByUser: vi.fn().mockResolvedValue([]),
    updateCandidates: vi.fn().mockImplementation((_id: string, data: Parameters<EventDraftRepositoryPort['updateCandidates']>[1]) =>
      Promise.resolve({ ...makeDraft(), ...data }),
    ),
    promote: vi.fn().mockImplementation((id: string) =>
      Promise.resolve({ ...makeDraft(), id, status: 'promoted' }),
    ),
    abandon: vi.fn().mockImplementation((id: string) =>
      Promise.resolve({ ...makeDraft(), id, status: 'abandoned' }),
    ),
    ...overrides,
  };
}

function makeEventCreator(overrides?: Partial<EventCreationPort>): EventCreationPort {
  return {
    createEventWithInvitations: vi.fn().mockResolvedValue(makeEvent()),
    ...overrides,
  };
}

function makeMemberRepo(isMemberResult = true, members: string[] = []): GroupMemberRepositoryPort {
  return {
    findByGroupAndUser: vi.fn().mockResolvedValue(null),
    listByGroup: vi.fn().mockResolvedValue(members.map((userId) => ({ id: userId, groupId: GROUP_ID, userId, role: 'member', joinedAt: new Date() }))),
    add: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
    isMember: vi.fn().mockResolvedValue(isMemberResult),
    getRole: vi.fn().mockResolvedValue(null),
  };
}

function makePipeline(
  fields: CandidateEventFields,
  draftRepo: EventDraftRepositoryPort = makeDraftRepo(),
  eventCreator: EventCreationPort = makeEventCreator(),
  memberIsMember = true,
): CapturePipelineService {
  return new CapturePipelineService(
    makeExtractor(fields),
    draftRepo,
    eventCreator,
    makeMemberRepo(memberIsMember),
  );
}

const GOOD_FIELDS: CandidateEventFields = {
  title: { value: 'Team Lunch', confidence: 0.9 },
  startDateTime: { value: '2026-06-01T12:00:00Z', confidence: 0.9 },
};

// ---------------------------------------------------------------------------
// tryParseDateTime
// ---------------------------------------------------------------------------

describe('tryParseDateTime', () => {
  it('parses a valid ISO 8601 datetime string', () => {
    const result = tryParseDateTime('2026-06-01T12:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe('2026-06-01T12:00:00.000Z');
  });

  it('parses an ISO datetime with offset', () => {
    const result = tryParseDateTime('2026-06-01T14:00:00+02:00');
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe('2026-06-01T12:00:00.000Z');
  });

  it('returns null for an unparseable string', () => {
    expect(tryParseDateTime('tomorrow at noon')).toBeNull();
    expect(tryParseDateTime('next friday')).toBeNull();
    expect(tryParseDateTime('')).toBeNull();
  });

  it('returns null for a date-only string (no time component)', () => {
    // Date-only strings are intentionally rejected to avoid ambiguous midnight-UTC coercions.
    // Callers should surface an explicit ambiguous_date or missing_start_time issue code.
    const result = tryParseDateTime('2026-06-01');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CaptureTextUseCase
// ---------------------------------------------------------------------------

describe('CaptureTextUseCase', () => {
  it('creates an event when all required fields are extracted with high confidence', async () => {
    const caller = FakeIdentity.random();
    const createFn = vi.fn().mockResolvedValue(makeEvent());
    const pipeline = makePipeline(GOOD_FIELDS, makeDraftRepo(), makeEventCreator({ createEventWithInvitations: createFn }));
    const useCase = new CaptureTextUseCase(pipeline);

    const result = await useCase.execute(caller, { text: 'Team lunch tomorrow at noon', groupId: GROUP_ID });

    expect(result.type).toBe('event');
    expect(createFn).toHaveBeenCalledOnce();
  });

  it('creates a draft when title is missing', async () => {
    const caller = FakeIdentity.random();
    const draftRepo = makeDraftRepo();
    const pipeline = makePipeline(
      { startDateTime: { value: '2026-06-01T12:00:00Z', confidence: 0.9 } },
      draftRepo,
    );
    const useCase = new CaptureTextUseCase(pipeline);

    const result = await useCase.execute(caller, { text: 'Meeting tomorrow', groupId: GROUP_ID });

    expect(result.type).toBe('draft');
    if (result.type === 'draft') {
      expect(result.draft.issues.some((i) => i.code === 'missing_title')).toBe(true);
    }
    expect(draftRepo.create).toHaveBeenCalledOnce();
  });

  it('creates a draft when start date is missing', async () => {
    const caller = FakeIdentity.random();
    const pipeline = makePipeline(
      { title: { value: 'Team Lunch', confidence: 0.9 } },
      makeDraftRepo(),
    );
    const useCase = new CaptureTextUseCase(pipeline);

    const result = await useCase.execute(caller, { text: 'Team lunch', groupId: GROUP_ID });

    expect(result.type).toBe('draft');
    if (result.type === 'draft') {
      expect(result.draft.issues.some((i) => i.code === 'missing_start_date')).toBe(true);
    }
  });

  it('creates a draft with invalid_time_range when end is before start', async () => {
    const caller = FakeIdentity.random();
    const pipeline = makePipeline(
      {
        title: { value: 'Team Lunch', confidence: 0.9 },
        startDateTime: { value: '2026-06-01T14:00:00Z', confidence: 0.9 },
        endDateTime: { value: '2026-06-01T12:00:00Z', confidence: 0.9 },
      },
      makeDraftRepo(),
    );
    const useCase = new CaptureTextUseCase(pipeline);

    const result = await useCase.execute(caller, { text: 'Team lunch 2pm to noon', groupId: GROUP_ID });

    expect(result.type).toBe('draft');
    if (result.type === 'draft') {
      expect(result.draft.issues.some((i) => i.code === 'invalid_time_range')).toBe(true);
    }
  });

  it('creates a draft with unauthorized_group_access when user is not a group member', async () => {
    const caller = FakeIdentity.random();
    const extractor = makeExtractor(GOOD_FIELDS);
    const draftRepo = makeDraftRepo();
    const eventCreator = makeEventCreator();
    const notMemberRepo = makeMemberRepo(false); // user is NOT a member

    const pipeline = new CapturePipelineService(extractor, draftRepo, eventCreator, notMemberRepo);
    const useCase = new CaptureTextUseCase(pipeline);

    const result = await useCase.execute(caller, { text: 'Team lunch', groupId: GROUP_ID });

    expect(result.type).toBe('draft');
    if (result.type === 'draft') {
      expect(result.draft.issues.some((i) => i.code === 'unauthorized_group_access')).toBe(true);
    }
  });

  it('creates a draft with missing_group when no groupId provided and none extracted', async () => {
    const caller = FakeIdentity.random();
    const pipeline = makePipeline(
      GOOD_FIELDS,
      makeDraftRepo(),
    );
    const useCase = new CaptureTextUseCase(pipeline);

    const result = await useCase.execute(caller, { text: 'Team lunch tomorrow at noon', groupId: null });

    expect(result.type).toBe('draft');
    if (result.type === 'draft') {
      expect(result.draft.issues.some((i) => i.code === 'missing_group')).toBe(true);
    }
  });

  it('creates a draft with low_confidence_extraction when title confidence is below threshold', async () => {
    const caller = FakeIdentity.random();
    const pipeline = makePipeline(
      {
        title: { value: 'Team Lunch', confidence: 0.3 }, // below threshold
        startDateTime: { value: '2026-06-01T12:00:00Z', confidence: 0.9 },
      },
      makeDraftRepo(),
    );
    const useCase = new CaptureTextUseCase(pipeline);

    const result = await useCase.execute(caller, { text: 'Team lunch', groupId: GROUP_ID });

    expect(result.type).toBe('draft');
    if (result.type === 'draft') {
      expect(result.draft.issues.some((i) => i.code === 'low_confidence_extraction')).toBe(true);
    }
  });

  it('throws VALIDATION_ERROR for empty text', async () => {
    const caller = FakeIdentity.random();
    const pipeline = makePipeline(GOOD_FIELDS);
    const useCase = new CaptureTextUseCase(pipeline);

    await expect(useCase.execute(caller, { text: '   ', groupId: GROUP_ID })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

// ---------------------------------------------------------------------------
// CaptureVoiceUseCase – uses the same downstream pipeline after STT
// ---------------------------------------------------------------------------

describe('CaptureVoiceUseCase', () => {
  it('uses the same downstream pipeline after STT transcription', async () => {
    const caller = FakeIdentity.random();
    const createFn = vi.fn().mockResolvedValue(makeEvent());
    const pipeline = makePipeline(GOOD_FIELDS, makeDraftRepo(), makeEventCreator({ createEventWithInvitations: createFn }));

    const sttAdapter: ISpeechToTextAdapter = {
      transcribe: vi.fn().mockResolvedValue({ transcript: 'Team lunch tomorrow at noon', confidence: 0.95 }),
    };

    const useCase = new CaptureVoiceUseCase(sttAdapter, pipeline);
    const result = await useCase.execute(caller, { audioBlobUri: 'blob://audio/123', groupId: GROUP_ID });

    expect(sttAdapter.transcribe).toHaveBeenCalledWith('blob://audio/123');
    expect(result.type).toBe('event');
  });

  it('creates a draft with missing_title when STT returns empty transcript', async () => {
    const caller = FakeIdentity.random();
    // Extractor returns nothing from empty transcript.
    const extractor = makeExtractor({});
    const pipeline = new CapturePipelineService(
      extractor,
      makeDraftRepo(),
      makeEventCreator(),
      makeMemberRepo(true),
    );

    const sttAdapter: ISpeechToTextAdapter = {
      transcribe: vi.fn().mockResolvedValue({ transcript: '', confidence: 0.0 }),
    };

    const useCase = new CaptureVoiceUseCase(sttAdapter, pipeline);
    const result = await useCase.execute(caller, { audioBlobUri: 'blob://audio/456', groupId: GROUP_ID });

    expect(result.type).toBe('draft');
    if (result.type === 'draft') {
      expect(result.draft.issues.some((i) => i.code === 'missing_title')).toBe(true);
      expect(result.draft.issues.some((i) => i.code === 'missing_start_date')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// CaptureImageUseCase – uses the same downstream pipeline after extraction
// ---------------------------------------------------------------------------

describe('CaptureImageUseCase', () => {
  it('uses the same downstream pipeline after image extraction', async () => {
    const caller = FakeIdentity.random();
    const createFn = vi.fn().mockResolvedValue(makeEvent());
    const pipeline = makePipeline(
      {},  // extractor returns nothing extra since pre-extracted fields are sufficient
      makeDraftRepo(),
      makeEventCreator({ createEventWithInvitations: createFn }),
    );

    const imageAdapter: IImageExtractionAdapter = {
      extractFields: vi.fn().mockResolvedValue({
        extractedText: 'Team lunch tomorrow at noon',
        fields: GOOD_FIELDS,
      }),
    };

    const useCase = new CaptureImageUseCase(imageAdapter, pipeline);
    const result = await useCase.execute(caller, { imageBlobUri: 'blob://images/poster.jpg', groupId: GROUP_ID });

    expect(imageAdapter.extractFields).toHaveBeenCalledWith('blob://images/poster.jpg');
    expect(result.type).toBe('event');
  });
});

// ---------------------------------------------------------------------------
// UpdateDraftUseCase
// ---------------------------------------------------------------------------

describe('UpdateDraftUseCase', () => {
  it('re-validates and returns updated draft when issues remain', async () => {
    const caller = FakeIdentity.random();
    const draft = makeDraft({
      createdByUserId: caller.userId,
      candidateTitle: null,
      issues: [{ code: 'missing_title', message: 'No title' }],
    });
    const draftRepo = makeDraftRepo({ findById: vi.fn().mockResolvedValue(draft) });
    const pipeline = new CapturePipelineService(makeExtractor({}), draftRepo, makeEventCreator(), makeMemberRepo(true));
    const useCase = new UpdateDraftUseCase(draftRepo, pipeline);

    const result = await useCase.execute(caller, {
      draftId: draft.id,
      title: 'Team Lunch',
      startAt: '2026-06-01T12:00:00Z',
    });

    expect(result.candidateTitle).toBe('Team Lunch');
    expect(draftRepo.updateCandidates).toHaveBeenCalledOnce();
  });

  it('throws NOT_FOUND for a draft owned by another user', async () => {
    const caller = FakeIdentity.random();
    const otherDraft = makeDraft({ createdByUserId: 'other-user' });
    const draftRepo = makeDraftRepo({ findById: vi.fn().mockResolvedValue(otherDraft) });
    const pipeline = new CapturePipelineService(makeExtractor({}), draftRepo, makeEventCreator(), makeMemberRepo(true));
    const useCase = new UpdateDraftUseCase(draftRepo, pipeline);

    await expect(useCase.execute(caller, { draftId: 'draft-1' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws CONFLICT for a promoted draft', async () => {
    const caller = FakeIdentity.random();
    const promotedDraft = makeDraft({ createdByUserId: caller.userId, status: 'promoted' });
    const draftRepo = makeDraftRepo({ findById: vi.fn().mockResolvedValue(promotedDraft) });
    const pipeline = new CapturePipelineService(makeExtractor({}), draftRepo, makeEventCreator(), makeMemberRepo(true));
    const useCase = new UpdateDraftUseCase(draftRepo, pipeline);

    await expect(useCase.execute(caller, { draftId: 'draft-1', title: 'Anything' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

// ---------------------------------------------------------------------------
// PromoteDraftUseCase
// ---------------------------------------------------------------------------

describe('PromoteDraftUseCase', () => {
  it('creates event and marks draft promoted when issues array is empty', async () => {
    const caller = FakeIdentity.random();
    const draft = makeDraft({ createdByUserId: caller.userId, issues: [] });
    const createFn = vi.fn().mockResolvedValue(makeEvent());
    const promoteFn = vi.fn().mockResolvedValue({ ...draft, status: 'promoted' });
    const draftRepo = makeDraftRepo({ findById: vi.fn().mockResolvedValue(draft), promote: promoteFn });
    const eventCreator = makeEventCreator({ createEventWithInvitations: createFn });

    const useCase = new PromoteDraftUseCase(draftRepo, eventCreator, makeMemberRepo(true));
    const result = await useCase.execute(caller, draft.id);

    expect(result.eventId).toBeDefined();
    expect(promoteFn).toHaveBeenCalledWith(draft.id);
  });

  it('throws CONFLICT when draft still has issues', async () => {
    const caller = FakeIdentity.random();
    const draft = makeDraft({
      createdByUserId: caller.userId,
      issues: [{ code: 'missing_title', message: 'No title' }],
    });
    const draftRepo = makeDraftRepo({ findById: vi.fn().mockResolvedValue(draft) });
    const useCase = new PromoteDraftUseCase(draftRepo, makeEventCreator(), makeMemberRepo(true));

    await expect(useCase.execute(caller, draft.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws NOT_FOUND for a draft owned by another user', async () => {
    const caller = FakeIdentity.random();
    const otherDraft = makeDraft({ createdByUserId: 'other-user' });
    const draftRepo = makeDraftRepo({ findById: vi.fn().mockResolvedValue(otherDraft) });
    const useCase = new PromoteDraftUseCase(draftRepo, makeEventCreator(), makeMemberRepo(true));

    await expect(useCase.execute(caller, 'draft-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws CONFLICT when caller is no longer a member of the group', async () => {
    const caller = FakeIdentity.random();
    const draft = makeDraft({ createdByUserId: caller.userId, issues: [] });
    const draftRepo = makeDraftRepo({ findById: vi.fn().mockResolvedValue(draft) });
    // Caller is no longer a group member.
    const useCase = new PromoteDraftUseCase(draftRepo, makeEventCreator(), makeMemberRepo(false));

    await expect(useCase.execute(caller, draft.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

// ---------------------------------------------------------------------------
// AbandonDraftUseCase
// ---------------------------------------------------------------------------

describe('AbandonDraftUseCase', () => {
  it('marks draft as abandoned', async () => {
    const caller = FakeIdentity.random();
    const draft = makeDraft({ createdByUserId: caller.userId });
    const abandonFn = vi.fn().mockResolvedValue({ ...draft, status: 'abandoned' });
    const draftRepo = makeDraftRepo({ findById: vi.fn().mockResolvedValue(draft), abandon: abandonFn });
    const useCase = new AbandonDraftUseCase(draftRepo);

    const result = await useCase.execute(caller, draft.id);

    expect(result.status).toBe('abandoned');
    expect(abandonFn).toHaveBeenCalledWith(draft.id);
  });

  it('throws NOT_FOUND for a draft owned by another user', async () => {
    const caller = FakeIdentity.random();
    const otherDraft = makeDraft({ createdByUserId: 'other-user' });
    const draftRepo = makeDraftRepo({ findById: vi.fn().mockResolvedValue(otherDraft) });
    const useCase = new AbandonDraftUseCase(draftRepo);

    await expect(useCase.execute(caller, 'draft-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws CONFLICT for an already-abandoned draft', async () => {
    const caller = FakeIdentity.random();
    const abandonedDraft = makeDraft({ createdByUserId: caller.userId, status: 'abandoned' });
    const draftRepo = makeDraftRepo({ findById: vi.fn().mockResolvedValue(abandonedDraft) });
    const useCase = new AbandonDraftUseCase(draftRepo);

    await expect(useCase.execute(caller, 'draft-1')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
