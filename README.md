# Nova-Circle

Privacy-first, security-first group calendar for friends, families, and private groups.

---

## Local development setup

### Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 10 |
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

| Milestone | Description | Status |
|-----------|-------------|--------|
| M1 – Foundation | Repo setup, CI, testing infrastructure, DB migrations, module skeletons | ✅ Complete |
| M2 – Groups and membership | Users, groups, memberships, basic auth wiring | ✅ Complete |
| M3 – Private event MVP | Event creation, invite-all, remove invitees, explicit invitations, access-controlled list | ✅ Complete |
| M4 – Event management | Edit, cancel, invitation changes, privacy and audit hardening | ⬜ Planned |
| M5 – Event collaboration | Event-scoped location, checklist, and chat | ⬜ Planned |
| M6 – Natural event capture | Text, voice, and image-based event capture via shared pipeline | ⬜ Planned |
| M7 – UI polish | Theme support, palette support, accessibility, visual cleanup | ⬜ Planned |

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

- [x] Event domain – `Event` entity (id, groupId, title, description, startAt, endAt, status, createdBy) and `EventInvitation` entity (id, eventId, userId, status: `invited` / `accepted` / `declined` / `tentative` / `removed`)
- [x] Create event – `POST /api/v1/groups/:groupId/events`: caller must be a group member; all current group members are seeded as invitees by default; creator can exclude specific members via `excludeUserIds`; event and invitations are persisted atomically in a single transaction
- [x] List events – `GET /api/v1/groups/:groupId/events`: returns only events the caller has an active `EventInvitation` for; inaccessible events are never disclosed
- [x] Get event – `GET /api/v1/groups/:groupId/events/:eventId`: returns event detail; responds `404` if the caller has no active invitation (preventing existence disclosure)
- [x] Cancel event – `DELETE /api/v1/groups/:groupId/events/:eventId`: creator or group `admin`/`owner` with an active invitation may cancel; sets `status` to `cancelled`; returns `204`
- [x] Explicit invitation model – group membership alone never grants event access after save; access is controlled exclusively by `EventInvitation` rows
- [x] Privacy enforcement – non-invited callers always receive `404 Not Found` (not `403 Forbidden`) to prevent event-existence disclosure
- [x] Database migration – `20260310000005_event_management.ts`: creates `events` and `event_invitations` tables with proper constraints, FK cascade rules, and status `CHECK` constraints

---

## Architecture and conventions

The `docs/architecture/` directory contains the authoritative architecture documentation:

| Document | Contents |
|---|---|
| [docs/architecture/overview.md](docs/architecture/overview.md) | System architecture, module boundaries, deployment model, security and privacy rules |
| [docs/architecture/access-control.md](docs/architecture/access-control.md) | Full authorization model, event visibility rules, invitation seeding, authorization test matrix |
| [docs/architecture/event-management.md](docs/architecture/event-management.md) | Event domain, lifecycle, invitation seeding |
| [docs/architecture/event-capture.md](docs/architecture/event-capture.md) | Text/voice/image capture pipeline, AI adapter boundary, draft flow |
| [docs/architecture/event-chat.md](docs/architecture/event-chat.md) | Event-scoped chat design and authorization |
| [docs/architecture/event-checklist.md](docs/architecture/event-checklist.md) | Event-scoped checklist design and authorization |
| [docs/architecture/event-location.md](docs/architecture/event-location.md) | Event-scoped location design and privacy rules |
| [docs/architecture/testing.md](docs/architecture/testing.md) | Full test strategy, deterministic design, CI integration |
| [docs/architecture/ci-cd.md](docs/architecture/ci-cd.md) | GitHub Actions pipelines, quality gates, merge blockers |
| [docs/architecture/module-template.md](docs/architecture/module-template.md) | Template for new module documentation |

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
