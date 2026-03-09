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
npm run test:api          # API tests (no database required; run in-process with supertest)
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

## Roadmap

| Milestone | Description | Status |
|-----------|-------------|--------|
| M1 – Foundation | Repo setup, CI, testing infrastructure, DB migrations, module skeletons | ✅ Complete |
| M2 – Groups and membership | Users, groups, memberships, basic auth wiring | 🔄 In progress |
| M3 – Private event MVP | Event creation, invite-all, remove invitees, explicit invitations, access-controlled list | ⬜ Planned |
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

### Milestone 2 – Groups and membership 🔄

**Goal:** Implement user profiles, group management, group membership, and basic JWT-based auth wiring.

- [ ] User domain – `UserProfile` entity, repository, and API
- [ ] Group domain – `Group` entity, repository, and management API (owner/admin CRUD)
- [ ] Membership domain – `GroupMember` entity, join / leave / remove flows, and membership API
- [ ] Basic auth wiring – Entra ID / B2C JWT validation middleware and identity context injection

---

## Architecture and conventions

See [`.github/copilot-instructions.md`](.github/copilot-instructions.md) for the full architecture reference, access-control rules, testing requirements, and coding conventions.

---

## CI

Every pull request runs the full CI pipeline:

1. **Lint** – ESLint + Prettier format check
2. **Typecheck** – TypeScript strict mode, no compile errors
3. **Unit tests** – fast, isolated, no database
4. **Integration tests** – database migrations + persistence layer (PostgreSQL)
5. **API tests** – HTTP endpoint contracts (PostgreSQL)
6. **Build** – `tsc` compiles cleanly

The build must be green before merging.
