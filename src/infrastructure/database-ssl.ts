/**
 * Resolves the SSL configuration for a PostgreSQL connection.
 *
 * Azure PostgreSQL Flexible Server (and most hosted PostgreSQL services)
 * require SSL regardless of whether NODE_ENV is set to "production".  Tying
 * SSL purely to NODE_ENV means a misconfigured container (e.g. NODE_ENV not
 * injected by Bicep) silently disables SSL and causes every query to fail.
 *
 * Strategy:
 *   - localhost / 127.0.0.1  → no SSL (local dev & CI with a Docker PostgreSQL)
 *   - all other hosts         → SSL enabled; strict cert verification only in
 *                               production (allows self-signed certs in staging)
 *
 * @param url        - The full database connection string.
 * @param production - Whether the app is running in production mode.
 */
export function resolveDbSsl(
  url: string,
  production: boolean,
): boolean | { rejectUnauthorized: boolean } {
  try {
    const { hostname } = new URL(url);
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return false;
    }
  } catch {
    // Malformed URL — enable SSL anyway as a safe default.
  }
  return { rejectUnauthorized: production };
}
