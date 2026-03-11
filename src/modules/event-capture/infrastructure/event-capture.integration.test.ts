import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { KnexEventDraftRepository } from './knex-event-draft.repository.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';
import { KnexGroupCreationService } from '../../group-management/infrastructure/knex-group-creation.service.js';
import { KnexGroupMemberRepository } from '../../group-membership/infrastructure/knex-group-member.repository.js';
import { KnexEventCreationService } from '../../event-management/infrastructure/knex-event-creation.service.js';
import { CapturePipelineService } from '../application/capture-pipeline.service.js';
import { CaptureTextUseCase } from '../application/capture-text.usecase.js';
import { CaptureVoiceUseCase } from '../application/capture-voice.usecase.js';
import { PromoteDraftUseCase } from '../application/promote-draft.usecase.js';
import { AbandonDraftUseCase } from '../application/abandon-draft.usecase.js';
import { FakeEventFieldExtractor } from './fake-event-field-extractor.js';
import { FakeSpeechToTextAdapter } from './fake-speech-to-text.adapter.js';
import type { IdentityContext } from '../../../shared/auth/identity-context.js';

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping database integration tests'
  : undefined;

const CREATOR_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('Event capture infrastructure integration', () => {
  let db: Knex;
  let draftRepo: KnexEventDraftRepository;
  let groupId: string;
  let creator: IdentityContext;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: CREATOR_ID, displayName: 'Capture Creator' });

    const groupCreator = new KnexGroupCreationService(db);
    const group = await groupCreator.createGroupWithOwner({
      name: 'Capture Test Group',
      description: null,
      ownerId: CREATOR_ID,
    });
    groupId = group.id;

    draftRepo = new KnexEventDraftRepository(db);
    creator = { userId: CREATOR_ID, displayName: 'Capture Creator' };
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  it.skipIf(skipReason !== undefined)(
    'persists a draft with issue codes when required fields are missing',
    async () => {
      const extractor = new FakeEventFieldExtractor({
        // No title, no start date – should produce draft with issues.
      });
      const memberRepo = new KnexGroupMemberRepository(db);
      const eventCreator = new KnexEventCreationService(db);
      const pipeline = new CapturePipelineService(extractor, draftRepo, eventCreator, memberRepo);
      const useCase = new CaptureTextUseCase(pipeline);

      const result = await useCase.execute(creator, {
        text: 'Some vague meeting text',
        groupId,
      });

      expect(result.type).toBe('draft');
      if (result.type === 'draft') {
        expect(result.draft.id).toBeTruthy();
        expect(result.draft.issues.length).toBeGreaterThan(0);
        expect(result.draft.issues.some((i) => i.code === 'missing_title')).toBe(true);
        expect(result.draft.status).toBe('pending_review');

        // Verify draft is persisted and can be retrieved.
        const fetched = await draftRepo.findById(result.draft.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.issues.length).toBeGreaterThan(0);
      }
    },
  );

  it.skipIf(skipReason !== undefined)(
    'creates an event directly when all required fields are present and valid',
    async () => {
      const extractor = new FakeEventFieldExtractor({
        title: { value: 'Team Standup', confidence: 0.95 },
        startDateTime: { value: '2026-06-15T09:00:00Z', confidence: 0.95 },
      });
      const memberRepo = new KnexGroupMemberRepository(db);
      const eventCreator = new KnexEventCreationService(db);
      const pipeline = new CapturePipelineService(extractor, draftRepo, eventCreator, memberRepo);
      const useCase = new CaptureTextUseCase(pipeline);

      const result = await useCase.execute(creator, {
        text: 'Team standup tomorrow at 9am',
        groupId,
      });

      expect(result.type).toBe('event');
      if (result.type === 'event') {
        expect(result.eventId).toBeTruthy();
      }
    },
  );

  it.skipIf(skipReason !== undefined)('abandoning a draft marks it as abandoned', async () => {
    const draft = await draftRepo.create({
      createdByUserId: CREATOR_ID,
      groupId,
      rawInputType: 'text',
      rawTextContent: 'some text',
      audioBlobReference: null,
      imageBlobReference: null,
      candidateTitle: null,
      candidateDescription: null,
      candidateStartAt: null,
      candidateEndAt: null,
      issues: [{ code: 'missing_title', message: 'No title' }],
    });

    const useCase = new AbandonDraftUseCase(draftRepo);
    const abandoned = await useCase.execute(creator, draft.id);

    expect(abandoned.status).toBe('abandoned');

    // Abandoned draft should not appear in listByUser (only pending_review are listed).
    const userDrafts = await draftRepo.listByUser(CREATOR_ID);
    expect(userDrafts.some((d) => d.id === draft.id)).toBe(false);
  });

  it.skipIf(skipReason !== undefined)(
    'promoting a resolved draft creates an event and marks the draft as promoted',
    async () => {
      const draft = await draftRepo.create({
        createdByUserId: CREATOR_ID,
        groupId,
        rawInputType: 'text',
        rawTextContent: 'Board meeting next week',
        audioBlobReference: null,
        imageBlobReference: null,
        candidateTitle: 'Board Meeting',
        candidateDescription: null,
        candidateStartAt: new Date('2026-07-01T10:00:00Z'),
        candidateEndAt: null,
        issues: [],
      });

      const memberRepo = new KnexGroupMemberRepository(db);
      const eventCreator = new KnexEventCreationService(db);
      const useCase = new PromoteDraftUseCase(draftRepo, eventCreator, memberRepo);
      const result = await useCase.execute(creator, draft.id);

      expect(result.eventId).toBeTruthy();

      const promotedDraft = await draftRepo.findById(draft.id);
      expect(promotedDraft!.status).toBe('promoted');
    },
  );

  // ---------------------------------------------------------------------------
  // CaptureVoiceUseCase – integration tests confirming same outcomes as text
  // ---------------------------------------------------------------------------

  it.skipIf(skipReason !== undefined)(
    'voice input with empty STT transcript produces a draft with the same issue codes as equivalent text input',
    async () => {
      const extractor = new FakeEventFieldExtractor({});
      const memberRepo = new KnexGroupMemberRepository(db);
      const eventCreator = new KnexEventCreationService(db);
      const pipeline = new CapturePipelineService(extractor, draftRepo, eventCreator, memberRepo);

      const sttAdapter = new FakeSpeechToTextAdapter({ transcript: '', confidence: 0.0 });
      const voiceUseCase = new CaptureVoiceUseCase(sttAdapter, pipeline);

      // Both use cases share the same pipeline and the same FakeEventFieldExtractor that
      // always returns empty fields regardless of input text, so the comparison is deterministic.
      const textUseCase = new CaptureTextUseCase(pipeline);

      const voiceResult = await voiceUseCase.execute(creator, {
        audioBlobUri: 'blob://audio/empty.wav',
        groupId,
      });
      const textResult = await textUseCase.execute(creator, {
        text: 'Team lunch', // FakeEventFieldExtractor returns no fields for any input
        groupId,
      });

      // Both inputs produce drafts because required fields are missing.
      expect(voiceResult.type).toBe('draft');
      expect(textResult.type).toBe('draft');

      if (voiceResult.type === 'draft' && textResult.type === 'draft') {
        const voiceIssueCodes = voiceResult.draft.issues.map((i) => i.code).sort();
        const textIssueCodes = textResult.draft.issues.map((i) => i.code).sort();
        expect(voiceIssueCodes).toEqual(textIssueCodes);
      }
    },
  );

  it.skipIf(skipReason !== undefined)(
    'voice input with a complete STT transcript creates an event, matching text input behaviour',
    async () => {
      const extractor = new FakeEventFieldExtractor({
        title: { value: 'Voice Standup', confidence: 0.95 },
        startDateTime: { value: '2026-09-01T09:00:00Z', confidence: 0.95 },
      });
      const memberRepo = new KnexGroupMemberRepository(db);
      const eventCreator = new KnexEventCreationService(db);
      const pipeline = new CapturePipelineService(extractor, draftRepo, eventCreator, memberRepo);

      const sttAdapter = new FakeSpeechToTextAdapter({
        transcript: 'Voice standup on September first at nine',
        confidence: 0.92,
      });
      const voiceUseCase = new CaptureVoiceUseCase(sttAdapter, pipeline);

      const voiceResult = await voiceUseCase.execute(creator, {
        audioBlobUri: 'blob://audio/standup.wav',
        groupId,
      });

      expect(voiceResult.type).toBe('event');
      if (voiceResult.type === 'event') {
        expect(voiceResult.eventId).toBeTruthy();
      }
    },
  );

  it.skipIf(skipReason !== undefined)(
    'voice draft is persisted with rawInputType "voice" and audioBlobReference set',
    async () => {
      const extractor = new FakeEventFieldExtractor({});
      const memberRepo = new KnexGroupMemberRepository(db);
      const eventCreator = new KnexEventCreationService(db);
      const pipeline = new CapturePipelineService(extractor, draftRepo, eventCreator, memberRepo);

      const sttAdapter = new FakeSpeechToTextAdapter({ transcript: '', confidence: 0.0 });
      const voiceUseCase = new CaptureVoiceUseCase(sttAdapter, pipeline);

      const result = await voiceUseCase.execute(creator, {
        audioBlobUri: 'blob://audio/traceable.wav',
        groupId,
      });

      expect(result.type).toBe('draft');
      if (result.type === 'draft') {
        expect(result.draft.rawInputType).toBe('voice');
        expect(result.draft.audioBlobReference).toBe('blob://audio/traceable.wav');
        expect(result.draft.imageBlobReference).toBeNull();

        // Verify draft is persisted and can be retrieved with correct traceability fields.
        const fetched = await draftRepo.findById(result.draft.id);
        expect(fetched).not.toBeNull();
        expect(fetched!.rawInputType).toBe('voice');
        expect(fetched!.audioBlobReference).toBe('blob://audio/traceable.wav');
      }
    },
  );
});
