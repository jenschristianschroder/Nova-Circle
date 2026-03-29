import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createAuthMiddleware } from './shared/auth/auth-middleware.js';
import { createRequireRegistrationMiddleware } from './shared/auth/require-registration-middleware.js';
import type { TokenValidatorPort } from './shared/auth/token-validator.port.js';
import { logger } from './shared/logger/logger.js';
import { KnexUserProfileRepository } from './modules/identity-profile/infrastructure/knex-user-profile.repository.js';
import { KnexGroupRepository } from './modules/group-management/infrastructure/knex-group.repository.js';
import { KnexGroupCreationService } from './modules/group-management/infrastructure/knex-group-creation.service.js';
import { KnexGroupMemberRepository } from './modules/group-membership/infrastructure/knex-group-member.repository.js';
import { KnexEventCreationService } from './modules/event-management/infrastructure/knex-event-creation.service.js';
import { KnexEventRepository } from './modules/event-management/infrastructure/knex-event.repository.js';
import { KnexEventInvitationRepository } from './modules/event-management/infrastructure/knex-event-invitation.repository.js';
import { KnexAuditLogRepository } from './modules/audit-security/infrastructure/knex-audit-log.repository.js';
import { createProfileRouter } from './modules/identity-profile/presentation/profile.router.js';
import { createSignupRouter } from './modules/identity-profile/presentation/signup.router.js';
import { createGroupRouter } from './modules/group-management/presentation/group.router.js';
import { createMembershipRouter } from './modules/group-membership/presentation/membership.router.js';
import { createEventRouter } from './modules/event-management/presentation/event.router.js';
import { createPersonalEventRouter } from './modules/event-management/presentation/personal-event.router.js';
import { KnexEventLocationRepository } from './modules/event-location/infrastructure/knex-event-location.repository.js';
import { KnexEventChecklistRepository } from './modules/event-checklist/infrastructure/knex-event-checklist.repository.js';
import { KnexEventChatRepository } from './modules/event-chat/infrastructure/knex-event-chat.repository.js';
import { createEventLocationRouter } from './modules/event-location/presentation/event-location.router.js';
import { createEventChecklistRouter } from './modules/event-checklist/presentation/event-checklist.router.js';
import { createEventChatRouter } from './modules/event-chat/presentation/event-chat.router.js';
import { KnexEventDraftRepository } from './modules/event-capture/infrastructure/knex-event-draft.repository.js';
import { FakeEventFieldExtractor } from './modules/event-capture/infrastructure/fake-event-field-extractor.js';
import { FakeSpeechToTextAdapter } from './modules/event-capture/infrastructure/fake-speech-to-text.adapter.js';
import { FakeImageExtractionAdapter } from './modules/event-capture/infrastructure/fake-image-extraction.adapter.js';
import { FakeBlobStorageAdapter } from './modules/event-capture/infrastructure/fake-blob-storage.adapter.js';
import { createCaptureRouter } from './modules/event-capture/presentation/capture.router.js';
import { KnexEventShareRepository } from './modules/event-sharing/infrastructure/knex-event-share.repository.js';
import { createEventShareRouter } from './modules/event-sharing/presentation/event-share.router.js';
import type { IEventFieldExtractor } from './modules/event-capture/application/event-field-extractor.port.js';
import type { ISpeechToTextAdapter } from './modules/event-capture/application/speech-to-text.port.js';
import type { IImageExtractionAdapter } from './modules/event-capture/application/image-extraction.port.js';
import type { IBlobStorageAdapter } from './modules/event-capture/application/blob-storage.port.js';

export interface AppDependencies {
  db?: Knex;
  /** JWT token validator. Required in NODE_ENV=production; optional elsewhere. */
  tokenValidator?: TokenValidatorPort;
  /**
   * AI/ML adapter overrides. When not provided, deterministic fake adapters are used.
   * In production, inject real Azure AI Service adapters.
   */
  eventFieldExtractor?: IEventFieldExtractor;
  speechToTextAdapter?: ISpeechToTextAdapter;
  imageExtractionAdapter?: IImageExtractionAdapter;
  /**
   * Blob storage adapter for image uploads. When not provided, a fake in-memory adapter is used.
   * In production, inject a real Azure Blob Storage adapter.
   */
  blobStorageAdapter?: IBlobStorageAdapter;
}

/**
 * Builds the Express application.
 *
 * When `deps.db` is provided all authenticated routes are mounted.
 * Without a DB only the health and info endpoints are available, which lets
 * the existing app-level tests run without a database connection.
 */
export function createApp(deps?: AppDependencies): express.Application {
  const app = express();

  // ── Request logging ──────────────────────────────────────────────────────
  // Log incoming requests with method, path, status, and duration when
  // REQUEST_LOGGING=1. Health-check probes are excluded to keep logs focused
  // on real traffic and to reduce log volume in production.
  if (process.env['REQUEST_LOGGING'] === '1' || process.env['REQUEST_LOGGING'] === 'true') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/health') {
        next();
        return;
      }
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('request', {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: duration,
        });
      });
      next();
    });
  }

  // ── Security middleware ────────────────────────────────────────────────────
  // Helmet sets secure HTTP headers (CSP, X-Frame-Options, etc.).
  app.use(helmet());

  // CORS – restrict cross-origin requests. Configure CORS_ORIGIN in production
  // to the frontend domain (e.g. "https://app.novacircle.com"). Defaults to
  // same-origin only when the variable is not set.
  const corsOrigin = process.env['CORS_ORIGIN'];
  const parsedOrigins = corsOrigin
    ? [
        ...new Set(
          corsOrigin
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0),
        ),
      ]
    : [];
  app.use(
    cors({
      origin: parsedOrigins.length > 0 ? parsedOrigins : false,
      credentials: true,
    }),
  );

  // Trust the first proxy (Azure Container Apps / reverse-proxy) so that
  // rate-limiting keys on the real client IP from X-Forwarded-For, not the
  // proxy IP.  Opt-in via TRUST_PROXY to avoid X-Forwarded-For spoofing when
  // running without a trusted reverse proxy in front (e.g. local dev).
  if (process.env['TRUST_PROXY'] === '1' || process.env['TRUST_PROXY'] === 'true') {
    app.set('trust proxy', 1);
  }

  // Rate limiting – protects against brute-force and DoS on the API.
  // Disabled in test environment to avoid false 429s during API test suites.
  if (process.env['NODE_ENV'] !== 'test') {
    app.use(
      '/api/',
      rateLimit({
        windowMs: 15 * 60 * 1000, // 15-minute window
        max: 100, // limit each IP to 100 requests per window
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.', code: 'RATE_LIMITED' },
      }),
    );
    // Apply a generous rate limit to the health endpoint: the DB probe added
    // there now means an unauthenticated caller could stress the database by
    // hammering /health.  60 req/min per IP is well above any legitimate load-
    // balancer frequency while blocking deliberate flood attempts.
    app.use(
      '/health',
      rateLimit({
        windowMs: 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests', code: 'RATE_LIMITED' },
      }),
    );
  }

  app.use(express.json({ limit: '1mb' }));

  // Health endpoint – used by CI smoke tests and load balancers.
  // When a database connection is configured it is probed with SELECT 1 so that
  // connectivity problems are caught by the smoke test rather than silently
  // falling through to the authenticated API routes.
  app.get('/health', async (_req: Request, res: Response) => {
    if (deps?.db) {
      try {
        await deps.db.raw('SELECT 1');
      } catch (err) {
        logger.error('Database health check failed', err);
        res.status(503).json({ status: 'error', message: 'Database unavailable' });
        return;
      }
    }
    res.json({ status: 'ok' });
  });

  // Version / info endpoint – returns non-sensitive runtime information.
  app.get('/api/v1/info', (_req: Request, res: Response) => {
    res.json({ name: 'nova-circle', version: '0.1.0' });
  });

  if (deps?.db) {
    const db = deps.db;

    const profileRepo = new KnexUserProfileRepository(db);
    const groupRepo = new KnexGroupRepository(db);
    const groupCreator = new KnexGroupCreationService(db);
    const memberRepo = new KnexGroupMemberRepository(db);
    const eventCreator = new KnexEventCreationService(db);
    const eventRepo = new KnexEventRepository(db);
    const invitationRepo = new KnexEventInvitationRepository(db);
    const auditLog = new KnexAuditLogRepository(db);

    const authMiddleware = createAuthMiddleware(deps.tokenValidator);
    const requireRegistration = createRequireRegistrationMiddleware(profileRepo, [
      { method: 'GET', pathPrefix: '/profile/me' },
      { method: 'POST', pathPrefix: '/signup' },
    ]);

    app.use('/api/v1', authMiddleware);
    app.use('/api/v1', requireRegistration);

    app.use('/api/v1/signup', createSignupRouter(profileRepo));
    app.use('/api/v1/profile', createProfileRouter(profileRepo));
    app.use('/api/v1/groups', createGroupRouter(groupCreator, groupRepo, memberRepo, auditLog));
    app.use('/api/v1/groups/:id/members', createMembershipRouter(memberRepo, auditLog));
    app.use(
      '/api/v1/groups/:groupId/events',
      createEventRouter(eventCreator, eventRepo, invitationRepo, memberRepo, auditLog),
    );
    app.use('/api/v1/events', createPersonalEventRouter(eventCreator, eventRepo, auditLog));

    const shareRepo = new KnexEventShareRepository(db);
    const locationRepo = new KnexEventLocationRepository(db);
    const checklistRepo = new KnexEventChecklistRepository(db);
    const chatRepo = new KnexEventChatRepository(db);

    app.use(
      '/api/v1/events/:eventId/shares',
      createEventShareRouter(eventRepo, memberRepo, shareRepo, auditLog),
    );
    app.use(
      '/api/v1/events/:eventId/location',
      createEventLocationRouter(eventRepo, invitationRepo, locationRepo, memberRepo),
    );
    app.use(
      '/api/v1/events/:eventId/checklist',
      createEventChecklistRouter(eventRepo, invitationRepo, checklistRepo, memberRepo),
    );
    app.use(
      '/api/v1/events/:eventId/chat',
      createEventChatRouter(eventRepo, invitationRepo, chatRepo, memberRepo),
    );

    const draftRepo = new KnexEventDraftRepository(db);

    // Real AI adapters can be injected via AppDependencies when available.
    // Fake adapters are used as a fallback until real implementations are wired in.
    const extractor = deps?.eventFieldExtractor ?? new FakeEventFieldExtractor();
    const sttAdapter = deps?.speechToTextAdapter ?? new FakeSpeechToTextAdapter();
    const imageAdapter = deps?.imageExtractionAdapter ?? new FakeImageExtractionAdapter();
    const blobStorage = deps?.blobStorageAdapter ?? new FakeBlobStorageAdapter();

    app.use(
      '/api/v1/capture',
      createCaptureRouter(
        draftRepo,
        eventCreator,
        memberRepo,
        extractor,
        sttAdapter,
        imageAdapter,
        blobStorage,
      ),
    );
  }

  // 404 handler for unmatched routes.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  });

  // Structured error handler – must have 4 parameters for Express to treat it as an error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });

  return app;
}
