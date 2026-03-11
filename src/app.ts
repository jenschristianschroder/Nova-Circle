import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import { createAuthMiddleware } from './shared/auth/auth-middleware.js';
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
import { createGroupRouter } from './modules/group-management/presentation/group.router.js';
import { createMembershipRouter } from './modules/group-membership/presentation/membership.router.js';
import { createEventRouter } from './modules/event-management/presentation/event.router.js';
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
import { createCaptureRouter } from './modules/event-capture/presentation/capture.router.js';
import type { IEventFieldExtractor } from './modules/event-capture/application/event-field-extractor.port.js';
import type { ISpeechToTextAdapter } from './modules/event-capture/application/speech-to-text.port.js';
import type { IImageExtractionAdapter } from './modules/event-capture/application/image-extraction.port.js';

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

  app.use(express.json());

  // Health endpoint – used by CI smoke tests and load balancers.
  app.get('/health', (_req: Request, res: Response) => {
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

    app.use('/api/v1', authMiddleware);

    app.use('/api/v1', createProfileRouter(profileRepo));
    app.use('/api/v1/groups', createGroupRouter(groupCreator, groupRepo, memberRepo, auditLog));
    app.use('/api/v1/groups/:id/members', createMembershipRouter(memberRepo, auditLog));
    app.use(
      '/api/v1/groups/:groupId/events',
      createEventRouter(eventCreator, eventRepo, invitationRepo, memberRepo, auditLog),
    );

    const locationRepo = new KnexEventLocationRepository(db);
    const checklistRepo = new KnexEventChecklistRepository(db);
    const chatRepo = new KnexEventChatRepository(db);

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

    const isProduction = process.env['NODE_ENV'] === 'production';
    if (isProduction) {
      const missingAdapters: string[] = [];
      if (!deps?.eventFieldExtractor) missingAdapters.push('eventFieldExtractor');
      if (!deps?.speechToTextAdapter) missingAdapters.push('speechToTextAdapter');
      if (!deps?.imageExtractionAdapter) missingAdapters.push('imageExtractionAdapter');
      if (missingAdapters.length > 0) {
        throw new Error(
          `Missing required AI adapters in production: ${missingAdapters.join(', ')}. ` +
            'Inject real implementations via AppDependencies when creating the app.',
        );
      }
    }

    const extractor = deps?.eventFieldExtractor ?? new FakeEventFieldExtractor();
    const sttAdapter = deps?.speechToTextAdapter ?? new FakeSpeechToTextAdapter();
    const imageAdapter = deps?.imageExtractionAdapter ?? new FakeImageExtractionAdapter();

    app.use(
      '/api/v1/capture',
      createCaptureRouter(draftRepo, eventCreator, memberRepo, extractor, sttAdapter, imageAdapter),
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
