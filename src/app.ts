import express from 'express';
import type { Request, Response } from 'express';

/**
 * Builds the Express application.
 * Exported as a factory function so tests can create isolated instances.
 */
export function createApp(): express.Application {
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

  return app;
}
