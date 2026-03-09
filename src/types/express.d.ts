import type { IdentityContext } from '../shared/auth/identity-context.js';

declare global {
  namespace Express {
    interface Request {
      identity?: IdentityContext;
    }
  }
}
