import type { IdentityContext } from './identity-context.js';

/** Port that validates a raw bearer token and returns the resolved identity. */
export interface TokenValidatorPort {
  validate(token: string): Promise<IdentityContext>;
}
