# Nova-Circle

Privacy-first, security-first group calendar for friends, families, and private groups.

---

## Local development setup

### Prerequisites

| Tool       | Version          |
| ---------- | ---------------- |
| Node.js    | ≥ 20             |
| npm        | ≥ 10             |
| PostgreSQL | ≥ 15 (or Docker) |

### First-time setup

```bash
# 1. Clone the repo
git clone https://github.com/jenschristianschroder/Nova-Circle.git
cd Nova-Circle

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and set DATABASE_URL and TEST_DATABASE_URL

# 4. Run migrations (creates the schema from scratch)
npm run migrate
```

### Running the server

```bash
npm run dev          # Start with live reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled output
```

### Running tests

```bash
npm run test              # Run all tests
npm run test:unit         # Unit tests only (no database required)
npm run test:integration  # Integration tests (requires TEST_DATABASE_URL)
npm run test:api          # API tests (requires TEST_DATABASE_URL; run in-process with supertest)
npm run test:coverage     # Tests with coverage report
```

### Lint and format

```bash
npm run lint              # Check for lint violations
npm run lint:fix          # Auto-fix lint violations
npm run format            # Format all source files
npm run format:check      # Check formatting (run in CI)
npm run typecheck         # TypeScript type-check only
```

### Database migrations

```bash
npm run migrate              # Apply all pending migrations
npm run migrate:rollback     # Roll back the most recent batch
npm run migrate:status       # Show current migration version
npm run migrate:make -- name # Create a new migration file
```

---

## Project structure

```text
Nova-Circle/
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions CI pipeline
├── db/
│   ├── knexfile.ts           # Knex database configuration
│   └── migrations/           # Ordered migration files
├── src/
│   ├── app.ts                # Express application factory
│   ├── server.ts             # Process entry point
│   ├── infrastructure/       # Cross-cutting infrastructure (DB client, etc.)
│   ├── shared/
│   │   └── test-helpers/     # Deterministic test utilities (FakeClock, FakeIdentity)
│   └── modules/
│       ├── identity-profile/
│       ├── group-management/
│       ├── group-membership/
│       ├── event-management/
│       ├── event-capture/
│       ├── event-chat/
│       ├── event-checklist/
│       ├── event-location/
│       ├── notifications/
│       └── audit-security/
└── ...config files
```

Each module follows the clean-architecture layer split:

```text
module/
├── domain/           # Entities, value objects, domain rules (no framework deps)
├── application/      # Use-case commands, queries, and policies
├── infrastructure/   # Repository implementations, DB access, adapters
└── presentation/     # HTTP controllers and route handlers
```

---

## Key design principles

- **Group membership alone never grants event access.** Event visibility is controlled exclusively by explicit `EventInvitation` records created at event creation time.
- **Inaccessible events are never disclosed.** Titles, counts, summaries, and hints about events a user cannot access must not appear in any response.
- **Authorization is enforced in application and domain logic**, not only at route or middleware level.
- **All services are stateless and container-friendly**, targeting Azure Container Apps with managed identity.

---

## Roadmap

| Milestone                  | Description                                                                               | Status      |
| -------------------------- | ----------------------------------------------------------------------------------------- | ----------- |
| M1 – Foundation            | Repo setup, CI, testing infrastructure, DB migrations, module skeletons                   | ✅ Complete |
| M2 – Groups and membership | Users, groups, memberships, basic auth wiring                                             | ✅ Complete |
| M3 – Private event MVP     | Event creation, invite-all, remove invitees, explicit invitations, access-controlled list | ✅ Complete |
| M4 – Event management      | Edit, cancel, invitation changes, privacy and audit hardening                             | ✅ Complete |
| M5 – Event collaboration   | Event-scoped location, checklist, and chat                                                | ✅ Complete |
| M6 – Natural event capture | Text, voice, and image-based event capture via shared pipeline                            | ✅ Complete |
| M7 – UI polish             | Theme support, palette support, accessibility, visual cleanup                             | ✅ Complete |

### Milestone 1 – Foundation ✅

All foundation work is complete:

- [x] Repo setup – directory structure, tooling, and coding conventions (TypeScript, ESLint, Prettier)
- [x] CI – GitHub Actions pipeline (lint, typecheck, unit tests, integration tests, API tests, build)
- [x] Testing infrastructure – Vitest 3 with unit / integration / API projects; `FakeClock`, `FakeIdentity`, `FakeEventBus`, `FakeStorage` test helpers
- [x] Database and migrations – Knex 3 + PostgreSQL, migration tooling wired up and verified in CI
- [x] Module skeletons – all 10 modules scaffolded with `domain/`, `application/`, `infrastructure/`, and `presentation/` layers

### Milestone 2 – Groups and membership ✅

All M2 work is complete:

- [x] User domain – `UserProfile` entity, repository, and API (`GET /api/v1/me`, `PUT /api/v1/me`)
- [x] Group domain – `Group` entity, repository, and management API – create, get (member-only), update (owner/admin), delete (owner)
- [x] Membership domain – `GroupMember` entity with `owner` / `admin` / `member` roles; add, list, and remove flows with fine-grained authorization
- [x] Basic auth wiring – Entra ID JWT validation middleware and `IdentityContext` injection; test-mode synthetic-header support
- [x] Database migrations – `user_profiles`, `groups`, and `group_members` tables with proper constraints and FK cascade rules
- [x] Security hardening – non-members receive `NOT_FOUND` (not `FORBIDDEN`) for group operations to prevent existence disclosure; atomic group creation seeds caller as owner in a single transaction

### Milestone 3 – Private event MVP ✅

All M3 work is complete:

- [x] Event domain – `Event` entity (id, groupId, title, description, startAt, endAt, status, createdBy, createdAt, updatedAt) and `EventInvitation` entity (id, eventId, userId, status: `invited` / `accepted` / `declined` / `tentative` / `removed`, invitedAt, respondedAt)
- [x] Create event – `POST /api/v1/groups/:groupId/events`: caller must be a group member; all current group members are seeded as invitees by default; creator can exclude specific members via `excludeUserIds`; event and invitations are persisted atomically in a single transaction
- [x] List events – `GET /api/v1/groups/:groupId/events`: returns only events the caller has an active `EventInvitation` for; inaccessible events are never disclosed
- [x] Get event – `GET /api/v1/groups/:groupId/events/:eventId`: returns event detail; responds `404` if the caller has no active invitation (preventing existence disclosure)
- [x] Cancel event – `DELETE /api/v1/groups/:groupId/events/:eventId`: event creator with an active invitation, or any group `admin`/`owner` in the event's group (invited or not), may cancel; non-admin callers still require an active invitation to avoid existence disclosure; sets `status` to `cancelled`; returns `204`
- [x] Explicit invitation model – group membership alone never grants event access after save; access is controlled exclusively by `EventInvitation` rows
- [x] Privacy enforcement – non-invited callers always receive `404 Not Found` (not `403 Forbidden`) to prevent event-existence disclosure
- [x] Database migration – `20260310000005_event_management.ts`: creates `events` and `event_invitations` tables with proper constraints, FK cascade rules, and status `CHECK` constraints

### Milestone 4 – Event management ✅

All M4 work is complete:

- [x] Update event – `PATCH /api/v1/groups/:groupId/events/:eventId`: creator or group admin/owner can patch title, description, startAt, endAt; validates time range; non-invited callers receive `404` to prevent existence disclosure; cancelled events cannot be edited
- [x] Cancel event – `POST /api/v1/groups/:groupId/events/:eventId/cancel` (dedicated cancel endpoint) plus existing `DELETE`
- [x] List event invitations – `GET /api/v1/groups/:groupId/events/:eventId/invitations`: returns invitation list to authorised callers
- [x] Add event invitee – `POST /api/v1/groups/:groupId/events/:eventId/invitations`: creator or admin/owner can invite an existing group member; emits audit log entry; prevents duplicate invitations
- [x] Remove event invitee – `DELETE /api/v1/groups/:groupId/events/:eventId/invitations/:userId`: creator or admin/owner can remove an invitee; emits audit log entry
- [x] Audit security module – `AuditLogPort`, `KnexAuditLogRepository`, structured audit event type; sensitive invitation and event actions are recorded; migration `20260310000006_audit_security.ts`
- [x] Privacy hardening – all new use cases follow the `NOT_FOUND` (not `FORBIDDEN`) pattern; dedicated `information-disclosure.api.test.ts` validates non-invited callers cannot probe event existence through edit, cancel, or invitation endpoints

### Milestone 5 – Event collaboration ✅

All M5 work is complete:

- [x] Event chat – `GET/POST /api/v1/groups/:groupId/events/:eventId/chat/messages`, `PUT/DELETE /:messageId`: post, list, edit, and soft-delete text messages; access inherits event invitation; chat policy unit-tested; integration-tested
- [x] Event checklist – `GET /api/v1/groups/:groupId/events/:eventId/checklist` plus `POST/PUT/DELETE` for items, complete/uncomplete toggle, and reorder: full checklist lifecycle; items have text, optional assignee, optional due date, and ordering; access inherits event invitation; checklist policy unit-tested
- [x] Event location – `GET/PUT/DELETE /api/v1/groups/:groupId/events/:eventId/location`: set, retrieve, and clear event location; supports freeform text, structured address fields, coordinates, and virtual meeting URL; access inherits event invitation; location policy unit-tested
- [x] Collaboration migration – `20260311000007_event_collaboration.ts`: creates `event_chat_messages`, `event_checklist_items`, and `event_locations` tables with proper constraints, FK cascade rules, and indexes

### Milestone 6 – Natural event capture ✅

All M6 work is complete:

- [x] Shared capture pipeline – `CapturePipelineService`: normalise → extract → validate → persist; all three input types (text, voice, image) feed into the same downstream flow
- [x] Text capture – `POST /api/v1/capture/text`: natural-language text input parsed and promoted to an event or saved as a structured draft
- [x] Voice capture – `POST /api/v1/capture/voice`: audio uploaded, transcribed via `SpeechToTextPort`, then fed into the shared pipeline
- [x] Image capture – `POST /api/v1/capture/image`: image uploaded (jpeg/png/gif/webp/heic/heif, max 10 MB), stored via `IBlobStorageAdapter`, extracted via `ImageExtractionPort`, then fed into the shared pipeline
- [x] Draft flow – incomplete or low-confidence input creates a first-class `EventDraft` with structured `DraftIssueCode` values (e.g. `missing_title`, `ambiguous_date`, `low_confidence_extraction`); no silent guessing of uncertain fields
- [x] Draft management – `GET /api/v1/capture/drafts`, `GET /api/v1/capture/drafts/:draftId`, `PATCH /api/v1/capture/drafts/:draftId` (update fields), `POST /api/v1/capture/drafts/:draftId/promote` (convert to real event), `DELETE /api/v1/capture/drafts/:draftId` (abandon)
- [x] AI adapter boundary – `EventFieldExtractorPort`, `SpeechToTextPort`, and `ImageExtractionPort` are interfaces; real Azure AI adapters injected in production; deterministic fake adapters used in CI so no live model calls are required
- [x] Database migration – `20260311000008_event_capture.ts`: creates `event_drafts` and `event_draft_issues` tables with proper constraints and FK cascade rules
- [x] Full test coverage – unit tests for pipeline logic (`capture-pipeline.unit.test.ts`), fake adapter unit tests, integration tests for repository layer, API tests for all capture and draft endpoints

### Milestone 7 – UI polish ✅

All M7 work is complete:

- [x] **Client frontend** – React + TypeScript + Vite project scaffolded under `client/`; separate `package.json`, `tsconfig.json`, and Vitest configuration
- [x] **Semantic design token system** – `tokens.ts` defines all CSS custom properties by role (surface, content, border, accent, danger, success, typography, spacing, radius, shadow); components reference only tokens, never hardcoded values
- [x] **Curated colour palettes** – `palettes.ts` provides four palettes (Default / Ocean / Forest / Sunset); all colour combinations meet WCAG 2.1 AA contrast requirements (≥ 4.5:1 for normal text, ≥ 3:1 for large text and UI components)
- [x] **Theme system** – `themes.ts` maps semantic tokens to concrete palette values for light and dark modes; `ThemeContext.tsx` provides a React context that resolves and applies the full token set to the `<html>` element via CSS custom properties
- [x] **Light / dark mode + palette switching** – `ThemeProvider` exposes a `useTheme()` hook with `setMode(mode)` and `setPaletteId(id)`; preference is persisted to `localStorage` and restored on load
- [x] **Global CSS baseline** – `global.css` applies a CSS reset, sets the token-driven type scale on `h1`–`h6`, and wires the default font families
- [x] **Typography scale tokens** – `--nc-font-size-xs` (0.75 rem) through `--nc-font-size-2xl` (2 rem) defined in `tokens.ts`; all heading and body styles use these variables instead of hardcoded values
- [x] **ThemeSwitcher component** – accessible button group for toggling light/dark mode and selecting a palette; uses only design tokens; keyboard and screen-reader friendly
- [x] **Button component** – primary / secondary / danger variants with sm / md / lg sizes and disabled state; CSS Modules with full token coverage
- [x] **SkipLink component** – WCAG 2.1 AA skip-navigation link rendered before page content; visually hidden until focused
- [x] **VisuallyHidden component** – reusable utility for screen-reader-only text; used by SkipLink and other accessible components
- [x] **WCAG 2.1 AA contrast validation** – `contrast.test.ts` programmatically verifies contrast ratios for all theme + palette combinations; CI fails if any combination drops below AA thresholds
- [x] **axe-core accessibility audits** – `accessibility.test.tsx` runs automated axe-core audits across all themed component combinations; integrated into the `client` CI job so accessibility regressions block merge
- [x] **Theme and palette snapshot tests** – `theme-snapshots.test.ts` and `themed-components.test.tsx` lock in resolved token values and rendered output for all theme / palette combinations; catch accidental visual regressions
- [x] **Design system unit tests** – `tokens.test.ts` validates token completeness and naming conventions; `palettes.test.ts` validates palette structure and scale lengths; `ThemeContext.test.tsx` verifies mode switching, palette switching, and localStorage persistence
- [x] **Client CI job** – dedicated GitHub Actions `client` job runs format check, typecheck, and the full Vitest suite (including axe-core audits and contrast checks) on every pull request

---

## Architecture and conventions

The `docs/architecture/` directory contains the authoritative architecture documentation:

| Document                                                                       | Contents                                                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| [docs/architecture/overview.md](docs/architecture/overview.md)                 | System architecture, module boundaries, deployment model, security and privacy rules            |
| [docs/architecture/access-control.md](docs/architecture/access-control.md)     | Full authorization model, event visibility rules, invitation seeding, authorization test matrix |
| [docs/architecture/event-management.md](docs/architecture/event-management.md) | Event domain, lifecycle, invitation seeding                                                     |
| [docs/architecture/event-capture.md](docs/architecture/event-capture.md)       | Text/voice/image capture pipeline, AI adapter boundary, draft flow                              |
| [docs/architecture/event-chat.md](docs/architecture/event-chat.md)             | Event-scoped chat design and authorization                                                      |
| [docs/architecture/event-checklist.md](docs/architecture/event-checklist.md)   | Event-scoped checklist design and authorization                                                 |
| [docs/architecture/event-location.md](docs/architecture/event-location.md)     | Event-scoped location design and privacy rules                                                  |
| [docs/architecture/testing.md](docs/architecture/testing.md)                   | Full test strategy, deterministic design, CI integration                                        |
| [docs/architecture/ci-cd.md](docs/architecture/ci-cd.md)                       | GitHub Actions pipelines, quality gates, merge blockers                                         |
| [docs/architecture/module-template.md](docs/architecture/module-template.md)   | Template for new module documentation                                                           |

For AI-assisted development conventions (coding style, test patterns, module conventions), see [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

---

## CI

Every pull request runs the full CI pipeline defined in [docs/architecture/ci-cd.md](docs/architecture/ci-cd.md):

1. **Lint** – ESLint + Prettier format check
2. **Typecheck** – TypeScript strict mode, no compile errors
3. **Unit tests** – fast, isolated, no database
4. **Integration tests** – database migrations + persistence layer (PostgreSQL)
5. **API tests** – HTTP endpoint contracts (in-process with supertest)
6. **Build** – `tsc` compiles cleanly

The build must be green before merging.
