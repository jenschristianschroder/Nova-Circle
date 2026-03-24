# CD Workflow Auth 401 Investigation

Tracking document for the recurring 401 Unauthorized error in the CD workflow
E2E tests.

## Symptom

Every CD workflow run fails during the Playwright E2E global-setup step.
After signing in via Entra ID the browser calls `GET /api/v1/groups` which
returns **401 Unauthorized** (`{"error":"Unauthorized","code":"UNAUTHORIZED"}`),
causing the "Failed to load groups" error to appear and the gate to fail.

The error has been present since E2E tests were added to the CD pipeline and
has never passed.

## Timeline

| Date | Run | Action | Outcome |
|---|---|---|---|
| 2026-03-23 | #82-#84 | Initial investigation — identified that the catch block in `auth-middleware.ts` silently swallowed `jwtVerify` errors. | Added diagnostic logging to surface the actual failure reason. |
| 2026-03-24 | #85 | Deployed PR #214 (pre-debug). E2E still fails with 401. No token claims visible in logs because debug logging was not yet merged. | Same 401 error, no new insights. |
| 2026-03-24 | #86 | Deployed PR #215 with temporary debug logging in `auth-middleware.ts`, `server.ts`, and `global-setup.ts`. | **Root cause identified** (see below). |
| 2026-03-24 | — | This PR: fix `EntraTokenValidator` to accept both v1 and v2 issuers, set `accessTokenAcceptedVersion=2` in CD workflow, remove temp debug logging. | Pending CI verification. |

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
registration is configured" step did **not** set this property, so if the
bootstrap attempt failed the setting remained at its default (`null` = v1).

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

- [ ] CD workflow run passes E2E tests after this PR is merged
- [ ] Token version changes to v2 after `accessTokenAcceptedVersion=2` takes
      effect (visible in future logs if diagnostic logging is re-enabled)

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
