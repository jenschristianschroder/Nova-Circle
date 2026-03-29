import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { Knex } from 'knex';
import { createTestDb } from '../../../infrastructure/test-db.js';
import { createApp } from '../../../app.js';
import { testAuthHeaders } from '../../../shared/test-helpers/test-auth.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';
import { KnexUserProfileRepository } from '../../identity-profile/infrastructure/knex-user-profile.repository.js';
import { FakeEventFieldExtractor } from '../infrastructure/fake-event-field-extractor.js';
import { FakeImageExtractionAdapter } from '../infrastructure/fake-image-extraction.adapter.js';

interface DraftIssue {
  code: string;
}

interface DraftBody {
  id: string;
  status: string;
  issues: DraftIssue[];
  candidateTitle?: string | null;
  imageBlobReference?: string | null;
}

interface CaptureResponseBody {
  type: 'event' | 'draft';
  eventId?: string;
  draft?: DraftBody;
}

interface ListDraftsResponseBody {
  drafts: DraftBody[];
}

const skipReason = !process.env['TEST_DATABASE_URL']
  ? 'TEST_DATABASE_URL is not set – skipping API tests'
  : undefined;

describe('Capture API', () => {
  let db: Knex;
  let app: Express.Application;

  const owner = FakeIdentity.random();
  const outsider = FakeIdentity.random();

  const fakeExtractor = new FakeEventFieldExtractor();
  const fakeImageAdapter = new FakeImageExtractionAdapter();

  let groupId: string;

  beforeAll(async () => {
    if (skipReason) return;
    db = createTestDb();
    await db.migrate.latest();
    app = createApp({
      db,
      eventFieldExtractor: fakeExtractor,
      imageExtractionAdapter: fakeImageAdapter,
    });

    const profileRepo = new KnexUserProfileRepository(db);
    await profileRepo.upsert({ userId: owner.userId, displayName: owner.displayName });
    await profileRepo.upsert({ userId: outsider.userId, displayName: outsider.displayName });

    // Create group with owner as the sole member.
    const groupRes = await request(app)
      .post('/api/v1/groups')
      .set(testAuthHeaders(owner.userId, owner.displayName))
      .send({ name: 'Capture Test Group' });
    groupId = (groupRes.body as { id: string }).id;
  });

  afterEach(() => {
    fakeExtractor.setFields({});
    fakeImageAdapter.setCandidate({ extractedText: null, fields: {} });
  });

  afterAll(async () => {
    if (db) await db.destroy();
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/capture/text
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/capture/text', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/capture/text')
        .send({ text: 'Team lunch tomorrow', groupId });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns 400 when text is missing', async () => {
      const res = await request(app)
        .post('/api/v1/capture/text')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ groupId });
      expect(res.status).toBe(400);
    });

    it.skipIf(skipReason !== undefined)('returns 400 when text is empty', async () => {
      const res = await request(app)
        .post('/api/v1/capture/text')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ text: '   ', groupId });
      expect(res.status).toBe(400);
    });

    it.skipIf(skipReason !== undefined)(
      'returns 202 and draft when input lacks required fields',
      async () => {
        // The fake extractor returns nothing (no fields extracted).
        const res = await request(app)
          .post('/api/v1/capture/text')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ text: 'Something vague', groupId });

        // The fake extractor returns no fields → draft with missing_title and missing_start_date.
        expect(res.status).toBe(202);
        const body = res.body as CaptureResponseBody;
        expect(body.type).toBe('draft');
        expect(body.draft).toBeDefined();
        expect(body.draft!.issues.some((i) => i.code === 'missing_title')).toBe(true);
      },
    );

    it.skipIf(skipReason !== undefined)(
      'returns 202 with unauthorized_group_access for outsider',
      async () => {
        const res = await request(app)
          .post('/api/v1/capture/text')
          .set(testAuthHeaders(outsider.userId, outsider.displayName))
          .send({ text: 'Team lunch tomorrow at noon', groupId });

        expect(res.status).toBe(202);
        const body = res.body as CaptureResponseBody;
        expect(body.type).toBe('draft');
        expect(body.draft!.issues.some((i) => i.code === 'unauthorized_group_access')).toBe(true);
      },
    );

    it.skipIf(skipReason !== undefined)(
      'returns 201 with personal event when no groupId provided',
      async () => {
        fakeExtractor.setFields({
          title: { value: 'Team lunch', confidence: 0.95 },
          startDateTime: { value: '2026-07-01T12:00:00Z', confidence: 0.9 },
        });
        const res = await request(app)
          .post('/api/v1/capture/text')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ text: 'Team lunch tomorrow at noon' });

        expect(res.status).toBe(201);
        const body = res.body as CaptureResponseBody;
        expect(body.type).toBe('event');
        expect(body.eventId).toBeTruthy();
      },
    );
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/capture/voice
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/capture/voice', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/capture/voice')
        .send({ audioBlobUri: 'blob://audio/test.wav', groupId });
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns 400 when audioBlobUri is missing', async () => {
      const res = await request(app)
        .post('/api/v1/capture/voice')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ groupId });
      expect(res.status).toBe(400);
    });

    it.skipIf(skipReason !== undefined)(
      'returns 202 and draft for voice input (fake STT returns empty transcript)',
      async () => {
        const res = await request(app)
          .post('/api/v1/capture/voice')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ audioBlobUri: 'blob://audio/test.wav', groupId });

        // Fake STT returns empty transcript → extractor returns nothing → draft.
        expect(res.status).toBe(202);
        const body = res.body as CaptureResponseBody;
        expect(body.type).toBe('draft');
        expect(body.draft!.issues.some((i) => i.code === 'missing_title')).toBe(true);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/capture/image
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/capture/image', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/capture/image')
        .attach('image', Buffer.from('fake-image-bytes'), {
          filename: 'poster.jpg',
          contentType: 'image/jpeg',
        })
        .field('groupId', groupId);
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns 400 when image file is missing', async () => {
      const res = await request(app)
        .post('/api/v1/capture/image')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .field('groupId', groupId);
      expect(res.status).toBe(400);
    });

    it.skipIf(skipReason !== undefined)('returns 400 for unsupported image type', async () => {
      const res = await request(app)
        .post('/api/v1/capture/image')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .attach('image', Buffer.from('not-an-image'), {
          filename: 'document.pdf',
          contentType: 'application/pdf',
        })
        .field('groupId', groupId);
      expect(res.status).toBe(400);
    });

    it.skipIf(skipReason !== undefined)('returns 413 when image exceeds size limit', async () => {
      // Create a buffer slightly larger than the 10 MB limit.
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1);
      const res = await request(app)
        .post('/api/v1/capture/image')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .attach('image', oversized, { filename: 'huge.jpg', contentType: 'image/jpeg' })
        .field('groupId', groupId);
      expect(res.status).toBe(413);
      expect((res.body as { code: string }).code).toBe('VALIDATION_ERROR');
    });

    it.skipIf(skipReason !== undefined)(
      'returns 202 and draft for image input (fake extractor returns nothing)',
      async () => {
        const res = await request(app)
          .post('/api/v1/capture/image')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .attach('image', Buffer.from('fake-image-bytes'), {
            filename: 'poster.jpg',
            contentType: 'image/jpeg',
          })
          .field('groupId', groupId);

        // Fake image extractor returns nothing → draft.
        expect(res.status).toBe(202);
        const body = res.body as CaptureResponseBody;
        expect(body.type).toBe('draft');
        expect(body.draft).toBeDefined();
      },
    );

    it.skipIf(skipReason !== undefined)(
      'draft has imageBlobReference set for traceability',
      async () => {
        const captureRes = await request(app)
          .post('/api/v1/capture/image')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .attach('image', Buffer.from('fake-image-bytes'), {
            filename: 'event-flyer.png',
            contentType: 'image/png',
          })
          .field('groupId', groupId);

        expect(captureRes.status).toBe(202);
        const draftId = (captureRes.body as CaptureResponseBody).draft!.id;

        // Fetch the draft and verify imageBlobReference is populated.
        const draftRes = await request(app)
          .get(`/api/v1/capture/drafts/${draftId}`)
          .set(testAuthHeaders(owner.userId, owner.displayName));

        expect(draftRes.status).toBe(200);
        const draft = draftRes.body as DraftBody & { imageBlobReference?: string };
        expect(draft.imageBlobReference).toBeTruthy();
        expect(typeof draft.imageBlobReference).toBe('string');
      },
    );

    it.skipIf(skipReason !== undefined)(
      'returns 201 with personal event when no groupId is provided',
      async () => {
        fakeImageAdapter.setCandidate({
          extractedText: 'Team lunch tomorrow at noon',
          fields: {
            title: { value: 'Team lunch', confidence: 0.95 },
            startDateTime: { value: '2026-07-01T12:00:00Z', confidence: 0.9 },
          },
        });
        const res = await request(app)
          .post('/api/v1/capture/image')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .attach('image', Buffer.from('fake-image-bytes'), {
            filename: 'flyer.jpg',
            contentType: 'image/jpeg',
          });

        expect(res.status).toBe(201);
        const body = res.body as CaptureResponseBody;
        expect(body.type).toBe('event');
        expect(body.eventId).toBeTruthy();
      },
    );
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/capture/drafts
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/capture/drafts', () => {
    it.skipIf(skipReason !== undefined)('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/capture/drafts');
      expect(res.status).toBe(401);
    });

    it.skipIf(skipReason !== undefined)('returns empty list initially', async () => {
      const user = FakeIdentity.random();
      const profileRepo = new KnexUserProfileRepository(db);
      await profileRepo.upsert({ userId: user.userId, displayName: user.displayName });

      const res = await request(app)
        .get('/api/v1/capture/drafts')
        .set(testAuthHeaders(user.userId, user.displayName));

      expect(res.status).toBe(200);
      expect((res.body as ListDraftsResponseBody).drafts).toEqual([]);
    });

    it.skipIf(skipReason !== undefined)('returns drafts belonging to caller', async () => {
      // Create a draft via text capture.
      await request(app)
        .post('/api/v1/capture/text')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ text: 'A vague message' });

      const res = await request(app)
        .get('/api/v1/capture/drafts')
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(200);
      const listBody = res.body as ListDraftsResponseBody;
      expect(Array.isArray(listBody.drafts)).toBe(true);
      expect(listBody.drafts.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/capture/drafts/:draftId
  // ---------------------------------------------------------------------------

  describe('GET /api/v1/capture/drafts/:draftId', () => {
    it.skipIf(skipReason !== undefined)('returns 404 for invalid UUID', async () => {
      const res = await request(app)
        .get('/api/v1/capture/drafts/not-a-uuid')
        .set(testAuthHeaders(owner.userId, owner.displayName));
      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns 404 for draft owned by another user', async () => {
      // Create a draft as owner.
      const captureRes = await request(app)
        .post('/api/v1/capture/text')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ text: 'Owner draft' });

      const draftId = (captureRes.body as { draft: { id: string } }).draft.id;

      // Attempt to access as outsider.
      const res = await request(app)
        .get(`/api/v1/capture/drafts/${draftId}`)
        .set(testAuthHeaders(outsider.userId, outsider.displayName));

      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns the draft for the owner', async () => {
      const captureRes = await request(app)
        .post('/api/v1/capture/text')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ text: 'Owner draft for get test' });

      const draftId = (captureRes.body as { draft: { id: string } }).draft.id;

      const res = await request(app)
        .get(`/api/v1/capture/drafts/${draftId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(200);
      expect((res.body as DraftBody).id).toBe(draftId);
    });
  });

  // ---------------------------------------------------------------------------
  // PUT /api/v1/capture/drafts/:draftId
  // ---------------------------------------------------------------------------

  describe('PUT /api/v1/capture/drafts/:draftId', () => {
    it.skipIf(skipReason !== undefined)('updates draft fields and re-validates', async () => {
      const captureRes = await request(app)
        .post('/api/v1/capture/text')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ text: 'Some vague input' });

      const draftId = (captureRes.body as { draft: { id: string } }).draft.id;

      const res = await request(app)
        .put(`/api/v1/capture/drafts/${draftId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({
          title: 'Updated Title',
          startAt: '2026-08-01T10:00:00Z',
          groupId,
        });

      expect(res.status).toBe(200);
      expect((res.body as DraftBody).candidateTitle).toBe('Updated Title');
    });

    it.skipIf(skipReason !== undefined)('returns 404 for draft owned by another user', async () => {
      const captureRes = await request(app)
        .post('/api/v1/capture/text')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ text: 'Owner draft update test' });

      const draftId = (captureRes.body as { draft: { id: string } }).draft.id;

      const res = await request(app)
        .put(`/api/v1/capture/drafts/${draftId}`)
        .set(testAuthHeaders(outsider.userId, outsider.displayName))
        .send({ title: 'Attempt to hijack' });

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/capture/drafts/:draftId/promote
  // ---------------------------------------------------------------------------

  describe('POST /api/v1/capture/drafts/:draftId/promote', () => {
    it.skipIf(skipReason !== undefined)(
      'returns 409 when draft has unresolved issues',
      async () => {
        const captureRes = await request(app)
          .post('/api/v1/capture/text')
          .set(testAuthHeaders(owner.userId, owner.displayName))
          .send({ text: 'Incomplete input' });

        const draftId = (captureRes.body as { draft: { id: string } }).draft.id;

        const res = await request(app)
          .post(`/api/v1/capture/drafts/${draftId}/promote`)
          .set(testAuthHeaders(owner.userId, owner.displayName));

        expect(res.status).toBe(409);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/v1/capture/drafts/:draftId
  // ---------------------------------------------------------------------------

  describe('DELETE /api/v1/capture/drafts/:draftId', () => {
    it.skipIf(skipReason !== undefined)('abandons a draft and returns 200', async () => {
      const captureRes = await request(app)
        .post('/api/v1/capture/text')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ text: 'Draft to abandon' });

      const draftId = (captureRes.body as { draft: { id: string } }).draft.id;

      const res = await request(app)
        .delete(`/api/v1/capture/drafts/${draftId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(200);
      expect((res.body as DraftBody).status).toBe('abandoned');
    });

    it.skipIf(skipReason !== undefined)('returns 404 for draft owned by another user', async () => {
      const captureRes = await request(app)
        .post('/api/v1/capture/text')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ text: 'Owner draft delete test' });

      const draftId = (captureRes.body as { draft: { id: string } }).draft.id;

      const res = await request(app)
        .delete(`/api/v1/capture/drafts/${draftId}`)
        .set(testAuthHeaders(outsider.userId, outsider.displayName));

      expect(res.status).toBe(404);
    });

    it.skipIf(skipReason !== undefined)('returns 409 for already-abandoned draft', async () => {
      const captureRes = await request(app)
        .post('/api/v1/capture/text')
        .set(testAuthHeaders(owner.userId, owner.displayName))
        .send({ text: 'Draft to double-abandon' });

      const draftId = (captureRes.body as { draft: { id: string } }).draft.id;

      // First abandon.
      await request(app)
        .delete(`/api/v1/capture/drafts/${draftId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      // Second abandon – should return 409 CONFLICT.
      const res = await request(app)
        .delete(`/api/v1/capture/drafts/${draftId}`)
        .set(testAuthHeaders(owner.userId, owner.displayName));

      expect(res.status).toBe(409);
    });
  });
});
