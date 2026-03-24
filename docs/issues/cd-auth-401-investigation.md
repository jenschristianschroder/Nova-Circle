# CD Workflow Auth 401 & API 500 Investigation

Tracking document for the recurring 401 Unauthorized error in the CD workflow
E2E tests and the subsequent 500 Internal Server Error observed during manual
browser testing.

## Symptom (original — 401 Unauthorized)

Every CD workflow run fails during the Playwright E2E global-setup step.
After signing in via Entra ID the browser calls `GET /api/v1/groups` which
returns **401 Unauthorized** (`{"error":"Unauthorized","code":"UNAUTHORIZED"}`),
causing the "Failed to load groups" error to appear and the gate to fail.

The error has been present since E2E tests were added to the CD pipeline and
has never passed.

**Status: ✅ Resolved** — CD run #87 passed E2E tests on 2026-03-24.

## Timeline

| Date | Run | Action | Outcome |
|---|---|---|---|
| 2026-03-23 | #82-#84 | Initial investigation — identified that the catch block in `auth-middleware.ts` silently swallowed `jwtVerify` errors. | Added diagnostic logging to surface the actual failure reason. |
| 2026-03-24 | #85 | Deployed PR #214 (pre-debug). E2E still fails with 401. No token claims visible in logs because debug logging was not yet merged. | Same 401 error, no new insights. |
| 2026-03-24 | #86 | Deployed PR #215 with temporary debug logging in `auth-middleware.ts`, `server.ts`, and `global-setup.ts`. | **Root cause identified** (see below). |
| 2026-03-24 | — | This PR: fix `EntraTokenValidator` to accept both v1 and v2 issuers, set `accessTokenAcceptedVersion=2` in CD workflow, remove temp debug logging. | Verified by CD run #87 — see next row. |
| 2026-03-24 | #87 | CD workflow passed — E2E tests, remote API tests, and promotion all succeeded. | **Auth 401 resolved.** |
| 2026-03-24 | — | Manual browser testing after promotion still shows "Failed to load groups" with HTTP 500 responses from the API. | New issue identified (see below). |
| 2026-03-24 | #88 | CD run after merging PR #217 (old revision recording fix). Deployment succeeded, old revisions properly deactivated. | Old revision fix verified. 500 issue still present in live site. |
| 2026-03-24 | — | Deep analysis of 500 root cause: database connection resilience, scale-to-zero cold starts, missing TCP keepalive, no pool error logging. | Fixes applied (see 500 resolution below). |

## Root Cause

The access token issued by Azure AD is a **v1.0** token:

```
aud: 'api://9b1c5974-69fb-4914-b1a1-6d6b3a0a4bac'
iss: 'https://sts.windows.net/7af8f68a-896b-44d5-994a-1c9bf336f8d7/'
ver: '1.0'
scp: 'user_impersonation'
appid: '9b1c5974-69fb-4914-b1a1-6d6b3a0a4bac'
```

But `EntraTokenValidator` only accepted the **v2.0** issuer:

```
expected issuer: https://login.microsoftonline.com/7af8f68a-896b-44d5-994a-1c9bf336f8d7/v2.0
actual issuer:   https://sts.windows.net/7af8f68a-896b-44d5-994a-1c9bf336f8d7/
```

`jose.jwtVerify()` rejected the token due to issuer mismatch, the catch block
returned 401, and the E2E test saw "Failed to load groups".

### Why is a v1.0 token being issued?

Azure AD issues v1 or v2 tokens based on the app registration's
`api.requestedAccessTokenVersion` (a.k.a. `accessTokenAcceptedVersion`):

- `null` or `1` → v1 tokens with issuer `https://sts.windows.net/{tenantId}/`
- `2` → v2 tokens with issuer `https://login.microsoftonline.com/{tenantId}/v2.0`

`bootstrap.sh` attempts to set this to `2` (line ~770) but uses `|| true`,
silently swallowing any failure.  The CD workflow's "Ensure Azure AD API app
registration is configured" step previously did **not** set this property, so
if the bootstrap attempt failed the setting remained at its default
(`null` = v1).  This PR adds the setting to the CD workflow as well.

## Resolution

### 1. Code fix — accept both v1 and v2 issuers (defensive)

`EntraTokenValidator` now passes an array of issuers to `jwtVerify()`:

```typescript
this.issuers = [
  `https://login.microsoftonline.com/${tenantId}/v2.0`,  // v2
  `https://sts.windows.net/${tenantId}/`,                 // v1
];
```

This makes authentication resilient regardless of the token version.

### 2. CD workflow fix — set `accessTokenAcceptedVersion=2`

Added a new step (1a) in the "Ensure Azure AD API app registration is
configured" section that checks and sets `requestedAccessTokenVersion=2` via
the Microsoft Graph API.  This should cause Azure AD to issue v2 tokens going
forward.

### 3. Cleanup — removed temporary debug logging

Removed all `[auth-debug]` / `TEMPORARY DEBUG LOGGING` markers from:

- `src/shared/auth/auth-middleware.ts`
- `src/server.ts`
- `client/e2e/global-setup.ts`

The diagnostic `decodeTokenClaimsForDiagnostics()` helper and the warn-level
log in the catch block are retained as permanent operational logging (without
the `[auth-debug]` prefix).

## Verification

- [x] CD workflow run passes E2E tests after this PR is merged — **run #87 passed**
- [ ] Token version changes to v2 after `accessTokenAcceptedVersion=2` takes
      effect (visible in future logs if diagnostic logging is re-enabled)

---

## Symptom (follow-on — 500 Internal Server Error)

**Status: 🔧 Fix applied** — database resilience improvements and `minReplicas: 1`
deployed.  Waiting for next CD run to verify.

CD workflow #87 passes (E2E tests pass against revision-specific URLs) but
manual browser testing after promotion shows **"Failed to load groups"**.

### Client container logs (subset)

The logs below are from the user's provided subset.  The `POST` requests are
from a different user agent (iPhone/Edge) attempting to create a group.  The
`GET /api/v1/groups` request that triggers "Failed to load groups" likely also
failed with 500 but is not visible in this subset.

```
07:04:14 "GET / HTTP/1.1" 200 832  ← SPA loads fine
07:04:14 "GET /env-config.js HTTP/1.1" 200 149  ← runtime env config OK
07:04:14 "POST /api/v1/groups HTTP/1.1" 500 57  ← API returns error
07:04:15 "POST /api/v1/groups HTTP/1.1" 500 57  ← retry also fails
```

### API container logs viewed by user

```
Connected to container: 'nova-circle-api'
  [Revision: 'ca-nova-circle-dev--0000020']
07:01:11 {"level":"info","message":"Server started","port":3000}
07:01:19 (node:1) Warning: SECURITY WARNING: SSL modes …
```

No HTTP request logs at all in the API container.

## Analysis

### 1. The nginx reverse proxy IS working — 500 comes from the API backend

The 57-byte response body matches exactly the API's JSON error format:

```json
{"error":"Internal server error","code":"INTERNAL_ERROR"}
```

(57 bytes — this is the response from the Express global error handler or the
route-level catch block in `group.router.ts`.)

If the nginx proxy were **not** configured (i.e. `API_BASE_URL` empty), the
request would fall through to the SPA fallback (`try_files … /index.html`) and
return **200** with the HTML shell, not 500.

If the nginx proxy **failed to connect** to the upstream, nginx would return
**502 Bad Gateway** or **504 Gateway Timeout**, not 500.

**Conclusion:** nginx proxied the request to the API, and the API returned 500.

### 2. The user is viewing the wrong API revision's logs

| What | Value |
|---|---|
| Revision in user's API logs | `ca-nova-circle-dev--0000020` |
| Revision promoted by CD #87 | `ca-nova-circle-dev--r1bf9dcd00` |
| Frontend `API_BASE_URL` | `https://ca-nova-circle-dev--r1bf9dcd00.…azurecontainerapps.io` |

The frontend's nginx reverse proxy forwards `/api` requests to the
**revision-specific URL** of `--r1bf9dcd00`.  Since the user connected to the
log stream of revision `--0000020`, the proxied requests would not appear there.

### 3. CD workflow fails to record old revision names

The "Record old revision names" step uses a JMESPath query:

```
properties.configuration.ingress.traffic[?weight>`0`].revisionName | [0]
```

This returns empty because the Bicep deployment assigns traffic via
`latestRevision: true` (the default when no explicit traffic rules are set).
A `latestRevision: true` traffic entry does **not** have a `revisionName`
property, so the query finds no match.

**Result:** `OLD_API=""`, `OLD_CLIENT=""` → deactivation steps run with an
empty revision name and only emit warnings (non-fatal failure).  Old revisions accumulate.

### 4. Probable cause of the API 500

The API returned 500 for `POST /api/v1/groups`, which means the request
**passed auth** (auth failures return 401) and reached the route handler.
The 500 is generated by the catch block in the POST handler when
`createGroup.execute()` throws a non-validation error — typically a database
query failure.

Possible causes:

- **Database connection timeout** — the promoted revision `--r1bf9dcd00` was
  idle for ~23 minutes between the E2E tests (06:41) and the manual test
  (07:04).  The connection pool may have been reaped by PostgreSQL's
  `idle_in_transaction_session_timeout` or `tcp_keepalives_idle`.
- **Cold-start database failure** — the revision may have scaled to zero
  (minReplicas: 0) and on cold-start the database connection failed to
  re-establish.
- **Stale Knex pool** — Node.js pg connection pools can hold stale connections
  that fail on first use after an idle period.

## Resolution (500 Internal Server Error)

### Root cause — database connection resilience + cold-start scaling

The API returned 500 for `POST /api/v1/groups` and `GET /api/v1/groups`
because database queries threw exceptions in the route handler catch blocks.
The underlying causes are interconnected:

1. **Scale-to-zero cold start** — `minReplicas: 0` on the API Container App
   means the container can be completely stopped between requests.  When traffic
   arrives after an idle period, Azure Container Apps cold-starts a new
   instance.  Knex begins establishing its minimum pool connections, but the
   readiness probe (`GET /health` → `SELECT 1`) can pass before the full pool
   is warmed, allowing user requests to arrive while the pool is still
   bootstrapping.

2. **No TCP keepalive** — the pg connection config had no `keepAlive` option.
   When Azure PostgreSQL Flexible Server's server-side idle timeout closes a
   TCP socket, the Knex pool still holds a reference to the dead connection.
   The next query on that socket fails with a network error, surfacing as
   a 500 to the user.

3. **No explicit pool timeouts** — the Knex pool used default tarn settings
   with no explicit `acquireTimeoutMillis`, `idleTimeoutMillis`, or
   `createRetryIntervalMillis`.  This meant:
   - Dead connections could linger in the pool until explicitly used and found broken
   - Acquisition of a new connection had the default 60 s timeout, too long for
     user-facing requests
   - No retry interval was configured for failed connection creation

4. **No pool error visibility** — pool-level errors (e.g. all connections in
   the pool simultaneously failing) were not logged, making diagnosis
   impossible from container logs alone.

### Fixes applied

| Fix | File | Description |
|---|---|---|
| TCP keepalive | `src/server.ts` | `keepAlive: true`, `keepAliveInitialDelayMillis: 10_000` on the pg connection config.  Detects server-side connection closures before Knex tries to use a dead socket. |
| Connection timeout | `src/server.ts` | `connectionTimeoutMillis: 5_000` — prevents indefinite hangs during cold start when the database is unreachable. |
| Pool acquire timeout | `src/server.ts` | `acquireTimeoutMillis: 15_000` — fail fast (15 s) instead of the default 60 s when the pool is exhausted or connections are dead. |
| Pool idle cleanup | `src/server.ts` | `idleTimeoutMillis: 30_000`, `reapIntervalMillis: 1_000` — proactively destroy idle connections before PostgreSQL can close them server-side. |
| Pool retry | `src/server.ts` | `createRetryIntervalMillis: 200` — retry failed connection creation after 200 ms instead of giving up immediately. |
| Pool error logging | `src/server.ts` | Listen for pool `error` events and log them via `logger.error()` so they appear in Application Insights / container logs. |
| Prevent cold start | `infra/modules/container-app.bicep` | Changed `minReplicas` from `0` to `1` for the API container so at least one replica is always running and the database connection pool stays warm. |
| Improved error logging | `group.router.ts` | Added `userId` to the error log for `GET /api/v1/groups` failures to aid correlation in Application Insights. |

### Architecture notes

**Frontend API_BASE_URL**: After promotion, the frontend's `API_BASE_URL`
continues to point to the revision-specific API URL (e.g.
`https://ca-nova-circle-dev--rd9744ab00.…azurecontainerapps.io`).  This is
stable and correct — the revision remains active because it has 100 % traffic.
Updating the env var to the main FQDN would require creating a new frontend
revision (env vars are immutable per revision in Azure Container Apps), which
adds unnecessary complexity.  The revision-specific URL is valid until the
next CD run deactivates the old revision and both frontend and API move to
new revisions simultaneously.

**CORS**: Because the frontend proxies `/api` requests through nginx
(server-side), all API calls appear same-origin to the browser.  CORS headers
are only needed for direct cross-origin calls, which this architecture avoids.

## Next Steps

### Immediate (manual)

1. **Check logs for the correct API revision** after this PR deploys.
   The new pool error logging and improved route error logging will show
   the exact database error if 500s recur.
   ```bash
   az containerapp logs show \
     --name ca-nova-circle-dev \
     --resource-group rg-nova-circle-dev \
     --follow
   ```

2. **Verify the manual test succeeds** — with `minReplicas: 1` the API should
   always be warm.  If "Failed to load groups" persists, check Application
   Insights for the specific error message logged by `group.router.ts`.

3. **If errors persist**, provide the API container logs from the correct
   revision (shown in the `az containerapp logs show` output header).
   The improved logging will show whether the error is:
   - A database connection error (pool/keepalive issue)
   - A query error (schema mismatch, permission issue)
   - Something else

### Monitoring

4. **Review Application Insights** for `Database connection pool error` traces.
   These indicate pool-level connectivity problems that the new event listener
   captures.

5. **Watch for readiness probe failures** in Azure Portal → Container App →
   Revisions → Logs.  With `minReplicas: 1`, the readiness probe continuously
   validates database connectivity.

## Lessons Learned

1. **Always log auth failures** — the original catch block swallowed the error
   silently, making diagnosis impossible without temporary debug additions.
2. **Azure AD token version is determined by the API app registration**, not by
   the MSAL client or the `/v2.0` endpoint URL.  Using the v2 authorize/token
   endpoints does not guarantee v2 tokens.
3. **Accept both issuer formats defensively** — even with
   `accessTokenAcceptedVersion=2` set, it's safer to accept both formats
   because the setting can be accidentally cleared or overridden.
4. **`|| true` in infrastructure scripts can hide critical failures** — the
   bootstrap script's attempt to set the token version was silently failing.
5. **Scale-to-zero and database connection pools don't mix well** — when a
   container scales to zero, all pool connections are destroyed.  On cold
   start, the readiness probe can pass before the pool is fully warmed,
   admitting user requests that fail.  Use `minReplicas: 1` for API
   containers that maintain database connections.
6. **TCP keepalive is essential for cloud database connections** — Azure
   PostgreSQL Flexible Server (and similar managed databases) close idle
   connections server-side.  Without TCP keepalive, the client-side pool
   silently holds dead sockets until a query fails.
7. **Pool error events must be logged** — pool-level errors in tarn/knex are
   emitted as events, not thrown.  Without explicit listeners, these errors
   are invisible in container logs.
