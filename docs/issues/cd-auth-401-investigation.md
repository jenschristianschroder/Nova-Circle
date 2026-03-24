# CD Workflow Auth & API Investigation

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
| 2026-03-24 | — | This PR: fix `EntraTokenValidator` to accept both v1 and v2 issuers, set `accessTokenAcceptedVersion=2` in CD workflow, remove temp debug logging. | Pending CI verification. |
| 2026-03-24 | #87 | CD workflow passed — E2E tests, remote API tests, and promotion all succeeded. | **Auth 401 resolved.** |
| 2026-03-24 | — | Manual browser testing after promotion still shows "Failed to load groups" with HTTP 500 responses from the API. | New issue identified (see below). |

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

CD workflow #87 passes (E2E tests pass against revision-specific URLs) but
manual browser testing after promotion shows **"Failed to load groups"**.

### Client container logs (subset)

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
empty revision name and fail silently.  Old revisions accumulate.

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

## Next Steps

### Immediate (manual)

1. **Check logs for the correct API revision** (`ca-nova-circle-dev--r1bf9dcd00`)
   in Azure Portal or via:
   ```bash
   az containerapp logs show \
     --name ca-nova-circle-dev \
     --resource-group rg-nova-circle-dev \
     --revision ca-nova-circle-dev--r1bf9dcd00 \
     --follow
   ```
   Look for error-level log entries around 07:04 UTC.

2. **Retry the manual test** — if the API recovers after a cold-start or
   connection-pool refresh, subsequent requests may succeed.

3. **Verify the API revision is still active:**
   ```bash
   az containerapp revision show \
     --name ca-nova-circle-dev \
     --resource-group rg-nova-circle-dev \
     --revision ca-nova-circle-dev--r1bf9dcd00 \
     --query "properties.runningState" --output tsv
   ```

### Code fixes (this PR)

4. **Fix "Record old revision names"** — fall back to `latestReadyRevisionName`
   when the traffic-based query returns empty.  This ensures old revisions are
   deactivated after promotion.

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
