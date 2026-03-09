# Nova-Circle

Nova-Circle is a **privacy-first, security-first** mobile and web application for friends, families, and other private groups to organize events. Every user sees only the data they are explicitly authorized to see — no exceptions.

---

## Table of Contents

- [Features](#features)
- [Core Principles](#core-principles)
- [Architecture](#architecture)
- [Module Overview](#module-overview)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Migrations](#database-migrations)
- [Running Tests](#running-tests)
- [CI/CD](#cicd)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [Security and Privacy](#security-and-privacy)
- [Documentation](#documentation)

---

## Features

- **Group management** — create groups, invite members, manage roles (owner / admin / member)
- **Event scheduling** — create, update, and cancel events with explicit per-event invitation lists
- **Smart event capture** — create events from natural language text, voice audio, or images through a shared AI-assisted pipeline
- **Event drafts** — incomplete or ambiguous input produces a structured draft with actionable issue codes instead of silently guessing
- **Event-scoped chat** — text chat restricted to event invitees; never visible at group level
- **Event-scoped checklist** — lightweight task list for each event; never aggregated at group level
- **Event-scoped location** — physical, virtual, and hybrid location data scoped to each event
- **Notifications** — delivery of notifications triggered by domain events
- **Audit log** — tamper-evident record of all sensitive operations across all modules
- **Light and dark mode** — curated color palettes with centralized semantic design tokens; all palettes meet accessibility contrast requirements

---

## Core Principles

When every decision is made, the following priorities apply in order:

1. **Correctness** — the system does what it says it does
2. **Privacy** — users never see data they are not explicitly authorized to see
3. **Security** — the system resists abuse at every layer
4. **Maintainability** — the code is readable and safe to change
5. **Explicit access control** — authorization is asserted in application/domain logic, not inferred from relationships
6. **Testability** — every rule is verifiable by an automated test
7. **Operational simplicity** — prefer solutions that are easy to operate and monitor

> **Critical invariant:** Group membership alone never grants event access. Access to an event is controlled exclusively by explicit `EventInvitation` records persisted at event creation time.

---

## Architecture

Nova-Circle is a **modular monolith** with clean-architecture layering inside every module. Module boundaries are enforced in code: cross-module calls pass through defined interfaces, never directly into another module's domain or infrastructure layer.

Each module follows this internal structure:

```
module/
  domain/          # Entities, value objects, domain events, policy rules
  application/     # Use cases, commands, queries, application services
  infrastructure/  # Repositories, ORM adapters, external service clients
  presentation/    # Controllers, request/response DTOs, route definitions
```

Business rules live in `domain/` and `application/` only. Controllers, HTTP frameworks, cloud SDKs, ORM details, and storage adapters must not appear in domain or application code.

Full architecture documentation is in [`docs/architecture/`](docs/architecture/).

---

## Module Overview

| Module | Responsibility |
|---|---|
| `identity-profile` | User identity, profile data, authentication integration |
| `group-management` | Group creation, settings, ownership, and administration |
| `group-membership` | Group member roles, join/leave, invitation to group |
| `event-management` | Event scheduling, invitation list, lifecycle, visibility |
| `event-capture` | Text/voice/image event creation pipeline, draft management |
| `event-chat` | Event-scoped text chat between event invitees |
| `event-checklist` | Event-scoped lightweight task list |
| `event-location` | Event-scoped physical, virtual, and hybrid location data |
| `notifications` | Delivery of notifications triggered by domain events |
| `audit-security` | Audit log of sensitive operations across all modules |

---

## Prerequisites

- **Node.js** 20 or later
- **npm** 10 or later
- **PostgreSQL** 16 (for integration and API tests, and local development)

---

## Getting Started

1. **Clone the repository**

   ```bash
   git clone https://github.com/jenschristianschroder/Nova-Circle.git
   cd Nova-Circle
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy the example environment file and fill in the required values:

   ```bash
   cp .env.example .env
   ```

   See [Environment Variables](#environment-variables) for details.

4. **Run database migrations**

   ```bash
   npm run migrate
   ```

5. **Build the project**

   ```bash
   npm run build
   ```

6. **Start the development server** *(once a dev server script is available)*

   ```bash
   npm run dev
   ```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string for the application database |
| `TEST_DATABASE_URL` | For tests | PostgreSQL connection string used when `NODE_ENV=test` |

No secrets or connection strings should be committed to source control. Refer to `.env.example` for the full list of required variables.

---

## Database Migrations

Migrations are managed with [Knex](https://knexjs.org/). Configuration lives in `db/knexfile.ts`.

```bash
# Apply all pending migrations
npm run migrate

# (See db/knexfile.ts for rollback and other migration commands)
```

Every schema change must be accompanied by a migration committed in the same pull request.

---

## Running Tests

Nova-Circle uses [Vitest](https://vitest.dev/) with three test projects (unit, integration, and API):

| Command | Description |
|---|---|
| `npm test` | Run all test projects |
| `npm run test:unit` | Unit tests only (no database required) |
| `npm run test:integration` | Integration tests (requires `TEST_DATABASE_URL`) |
| `npm run test:api` | API tests (no database, uses in-process Express) |

Additional quality checks:

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript type check (tsc --noEmit)
npm run build       # Compile TypeScript to dist/
```

> CI tests never call external services (AI APIs, blob storage, Service Bus). All external dependencies are replaced with deterministic fakes via injected interfaces.

---

## CI/CD

All automated testing and deployment is driven by **GitHub Actions**.

### Pull Request Pipeline

Every PR targeting `main` must pass:

1. Install dependencies
2. Lint
3. Typecheck
4. Unit tests
5. Integration tests
6. API tests
7. Authorization and privacy regression tests
8. Migration dry-run

### Main Branch Pipeline

Every push to `main` additionally runs:

- Full test suite
- Build validation
- Container build (multi-stage Dockerfile)
- Container smoke test (health endpoint check)
- Coverage report upload

**CI failure is a merge blocker.** No PR may merge while any required check is failing.

See [`docs/architecture/ci-cd.md`](docs/architecture/ci-cd.md) for the full pipeline specification.

---

## Project Structure

```
Nova-Circle/
├── src/
│   ├── modules/
│   │   ├── identity-profile/
│   │   ├── group-management/
│   │   ├── group-membership/
│   │   ├── event-management/
│   │   ├── event-capture/
│   │   ├── event-chat/
│   │   ├── event-checklist/
│   │   ├── event-location/
│   │   ├── notifications/
│   │   └── audit-security/
│   ├── shared/          # Shared value types, result types, interfaces, test helpers
│   └── infrastructure/  # Root DI container, shared DB connection, middleware
├── db/
│   └── knexfile.ts      # Knex migration configuration
├── docs/
│   └── architecture/    # Architecture decision records and design documents
├── .github/
│   └── workflows/       # GitHub Actions CI/CD pipeline definitions
└── dist/                # Compiled output (git-ignored)
```

---

## Contributing

1. **Fork** the repository and create a feature branch from `main`.
2. **Write tests first** — every feature, bug fix, authorization rule, and API endpoint requires automated tests. A change without tests does not meet the definition of done.
3. **Run the full quality suite** before opening a PR:
   ```bash
   npm run lint && npm run typecheck && npm test
   ```
4. **Open a pull request** against `main`. CI must pass before a PR can be merged.
5. **Reference the related issue** in your PR description.

### Definition of Done

A change is only complete when:

- [ ] Code compiles without errors (`npm run build`)
- [ ] Lint passes (`npm run lint`)
- [ ] All tests pass, including authorization and privacy tests (`npm test`)
- [ ] New behavior has test coverage
- [ ] Migrations are included if the schema changed
- [ ] API contracts are updated if endpoints changed
- [ ] CI passes on the pull request

---

## Security and Privacy

Nova-Circle treats security and privacy as mandatory constraints, not optional features.

- **Authentication** is handled via Microsoft Entra ID / External ID / B2C. Token validation occurs at the edge before any application code runs.
- **Authorization** is enforced in application/domain logic. Route-level middleware alone is not sufficient.
- **Event access** is governed exclusively by explicit `EventInvitation` records. Group membership alone never grants event access.
- **Hidden event non-disclosure**: inaccessible events are not disclosed through counts, titles, hints, or any other mechanism. Requests for inaccessible events return `404 Not Found`.
- **Data minimization**: endpoints return only the data required for their specific use case.
- **No secrets in source control**: use environment variables and Azure managed identity.

To report a security vulnerability, please open a GitHub issue marked **security** or contact the repository owner directly.

---

## Documentation

Detailed architecture and design documentation lives in [`docs/architecture/`](docs/architecture/):

| Document | Contents |
|---|---|
| [`overview.md`](docs/architecture/overview.md) | System architecture, module boundaries, deployment defaults |
| [`access-control.md`](docs/architecture/access-control.md) | Full authorization model, visibility rules, test matrix |
| [`event-management.md`](docs/architecture/event-management.md) | Event domain, lifecycle, invitation seeding |
| [`event-capture.md`](docs/architecture/event-capture.md) | Capture pipeline, AI adapter boundary, draft flow |
| [`event-chat.md`](docs/architecture/event-chat.md) | Event-scoped chat design and authorization |
| [`event-checklist.md`](docs/architecture/event-checklist.md) | Event-scoped checklist design and authorization |
| [`event-location.md`](docs/architecture/event-location.md) | Event-scoped location design and privacy rules |
| [`testing.md`](docs/architecture/testing.md) | Full test strategy, deterministic design, CI integration |
| [`ci-cd.md`](docs/architecture/ci-cd.md) | GitHub Actions pipelines, quality gates, merge blockers |
| [`module-template.md`](docs/architecture/module-template.md) | Template for new module documentation |