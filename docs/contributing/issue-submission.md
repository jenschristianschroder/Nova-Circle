# Issue Submission Guide

This guide explains how human contributors submit issues to Nova-Circle via the automated `pending-issues/` mechanism. The same mechanism is used by AI agents and human contributors alike, so issues are created consistently regardless of who authors them.

---

## Why a File-Based Mechanism?

Issues are created by dropping a JSON file into the `pending-issues/` directory on the `main` branch. A GitHub Actions workflow (`process-issue-requests.yml`) picks up every `.json` file, calls the GitHub API to create the corresponding issue, and then deletes the processed files. This keeps issue creation auditable (the JSON is committed to git history before it is processed) and allows batch issue creation without opening the repository to direct API access.

---

## Step-by-Step

### 1. Research the codebase first

Before writing an issue, read the affected code and the relevant architecture documents in `docs/architecture/`. Always read `/.github/copilot-instructions.md` for the authoritative list of architecture rules, security/privacy constraints, and testing requirements.

### 2. Draft the issue body

Every issue body must contain these four sections **in order**:

1. **Issue description** — What is the problem or opportunity? What currently exists (or is missing)?
2. **High-level requirements / Expected behavior** — What must the solution do? Be specific about functional and non-functional requirements.
3. **Additional notes** — Architecture decisions, constraints, links to related code, warnings.
4. **Acceptance criteria** — A checklist of concrete, testable conditions that must all be true before the issue is closed.

### 3. Create the JSON request file

Create a file in `pending-issues/` using this naming convention:

```
pending-issues/YYYYMMDD-HHMMSS-<short-slug>.json
```

Use the current UTC date and time to the second. The short slug is a lowercase, hyphen-separated summary of the issue (e.g. `auth-gate`, `client-routing`, `msal-integration`).

**Examples:**

```
pending-issues/20260318-130000-auth-gate.json
pending-issues/20260318-130001-client-routing.json
```

Use a **unique timestamp** per file. If you are creating multiple files at the same second, increment the seconds counter so filenames never collide.

### 4. Fill in all five fields

```json
{
  "title": "Short, descriptive issue title",
  "body": "Full issue body in Markdown.\n\nUse \\n for newlines.",
  "labels": ["enhancement"],
  "assignees": [],
  "milestone": null
}
```

### 5. Commit and open a pull request to `main`

Commit the JSON file(s) to a branch and open a pull request targeting `main`. When a maintainer merges the PR:

1. `process-issue-requests.yml` reads every `.json` file in `pending-issues/`.
2. It calls the GitHub Issues API to create each issue.
3. It deletes the processed files from `main` and commits the cleanup (marked `[skip ci]`).

---

## Complete JSON Sample

```json
{
  "title": "Add authentication gate to frontend — MSAL/Entra ID integration",
  "body": "## Issue description\n\nThe web client is currently served to any visitor without requiring authentication. There is no login flow, no MSAL provider, and no token acquisition. This violates the security-first design principle documented in `/docs/architecture/overview.md` and `.github/copilot-instructions.md`.\n\n## High-level requirements / Expected behavior\n\n- Install `@azure/msal-browser` and `@azure/msal-react` in the client.\n- Wrap the React app in an `MsalProvider` configured from environment variables (`VITE_AZURE_CLIENT_ID`, `VITE_AZURE_TENANT_ID`).\n- Redirect unauthenticated users to the Microsoft Entra ID login page.\n- After login, acquire an access token and attach it as a `Bearer` token on all `/api/v1/` requests.\n- Provide a logout action that clears the MSAL session.\n- No hard-coded tenant or client IDs in source code.\n\n## Additional notes\n\n- The backend already validates Bearer tokens via `EntraTokenValidator` (`src/shared/auth/entra-token-validator.ts`).\n- Token validator is wired in `src/server.ts` when `AZURE_TENANT_ID` and `AZURE_CLIENT_ID` env vars are set.\n- The frontend `vite.config.ts` proxies `/api` to the backend, so token injection only needs to happen on the client.\n\n## Acceptance criteria\n\n- [ ] `@azure/msal-browser` and `@azure/msal-react` are installed as client dependencies.\n- [ ] `MsalProvider` wraps the React app root.\n- [ ] Unauthenticated users are redirected to Entra ID login; the app does not render until identity is confirmed.\n- [ ] Acquired access token is attached as `Authorization: Bearer <token>` on all API requests.\n- [ ] Logout clears the MSAL session and redirects to the login page.\n- [ ] Client ID and tenant ID are read from `VITE_AZURE_CLIENT_ID` and `VITE_AZURE_TENANT_ID` (never hard-coded).\n- [ ] Unit/component tests cover the authenticated vs. unauthenticated rendering paths.\n- [ ] CI passes with the new dependency.",
  "labels": ["enhancement", "security"],
  "assignees": [],
  "milestone": null
}
```

---

## Field Reference

| Field | Required | Type | Valid values / notes |
|---|---|---|---|
| `title` | **Required** | string | Short, descriptive, sentence-case. No trailing punctuation. |
| `body` | **Required** | string | Full Markdown. Use `\n` for newlines inside a JSON string. All four sections must be present. |
| `labels` | Optional | array of strings | Must be existing label names in the repository (e.g. `"enhancement"`, `"bug"`, `"security"`, `"documentation"`). An empty array `[]` is valid. |
| `assignees` | Optional | array of strings | GitHub usernames of people to assign. An empty array `[]` is valid. Only repository collaborators can be assigned. |
| `milestone` | Optional | integer or null | The integer number of an existing milestone, or `null` to leave unset. |

---

## File Naming Convention

```
pending-issues/YYYYMMDD-HHMMSS-<short-slug>.json
```

| Part | Format | Example |
|---|---|---|
| `YYYYMMDD` | UTC date, no separators | `20260318` |
| `HHMMSS` | UTC time, no separators | `130005` |
| `short-slug` | Lowercase words separated by hyphens, ≤ 40 characters | `auth-gate` |

**Full example:** `pending-issues/20260318-130005-auth-gate.json`

---

## Rules and Constraints

- **Never create new workflow files** for issue submission. Use only the `pending-issues/` JSON mechanism.
- **Never modify** `.github/workflows/process-issue-requests.yml` or `.github/workflows/create-issue.yml`.
- Use a **unique timestamp** per file. If two files share a timestamp, one will overwrite the other.
- The `body` field must be valid Markdown. The workflow passes it verbatim to the GitHub API — invalid JSON or misformatted Markdown will cause the workflow to fail.
- The `pending-issues/` directory is cleaned automatically after processing. Do not store anything there permanently except `.gitkeep`.
- A pull request containing only `pending-issues/*.json` files does not require a full code review, but it must still pass CI.

---

## Related Documents

- `docs/issue-agent-instructions.md` — Instructions for the AI issue agent
- `.github/workflows/process-issue-requests.yml` — The workflow that processes submitted JSON files
- `docs/architecture/overview.md` — Architecture rules that issues must respect
- `.github/copilot-instructions.md` — Full project design principles and non-negotiable priorities
