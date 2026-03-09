import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import { createAuthMiddleware } from './shared/auth/auth-middleware.js';
import { KnexUserProfileRepository } from './modules/identity-profile/infrastructure/knex-user-profile.repository.js';
import { KnexGroupRepository } from './modules/group-management/infrastructure/knex-group.repository.js';
import { KnexGroupMemberRepository } from './modules/group-membership/infrastructure/knex-group-member.repository.js';
import { createProfileRouter } from './modules/identity-profile/presentation/profile.router.js';
import { createGroupRouter } from './modules/group-management/presentation/group.router.js';
import { createMembershipRouter } from './modules/group-membership/presentation/membership.router.js';

export interface AppDependencies {
  db?: Knex;
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
    const memberRepo = new KnexGroupMemberRepository(db);

    const authMiddleware = createAuthMiddleware();

    app.use('/api/v1', authMiddleware);

    app.use('/api/v1', createProfileRouter(profileRepo));
    app.use('/api/v1/groups', createGroupRouter(groupRepo, memberRepo));
    app.use('/api/v1/groups/:id/members', createMembershipRouter(memberRepo));
  }

  // 404 handler for unmatched routes.
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  });

  // Structured error handler – must have 4 parameters for Express to treat it as an error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  });

  return app;
}

