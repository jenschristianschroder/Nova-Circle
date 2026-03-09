# Nova-Circle — System Architecture Overview

## Purpose

Nova-Circle is a privacy-first, security-first mobile and web application for friends, families, and other private groups to organise events. The architecture is designed so that no user ever sees data they are not explicitly authorised to see, and so that the system can be maintained, tested, and extended without compromising those guarantees.

---

## Non-Negotiable Priorities

When every architectural decision is made, the following priorities apply in order:

1. **Correctness** — the system must do what it says it does.
2. **Privacy** — users must never see data they are not explicitly authorised to see.
3. **Security** — the system must resist abuse at every layer.
4. **Maintainability** — the code must be readable and safe to change.
5. **Explicit access control** — authorisation must be asserted in application/domain logic, not inferred from relationships.
6. **Testability** — every rule must be verifiable by an automated test.
7. **Operational simplicity** — prefer solutions that are easy to operate and monitor.

---

## Module Boundaries

Nova-Circle is structured as a **modular monolith**. Each module has a clearly defined responsibility, an explicit public API surface, and no direct coupling to the internals of any other module. Module boundaries must be enforced in code — cross-module calls pass through defined interfaces, never directly into another module's domain or infrastructure layer.

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

Modules that are currently part of the monolith are designed so they can be extracted into independent services later without changes to domain logic.

---

## Internal Module Structure

Every module follows a clean-architecture layering:

```
module/
  domain/          # Entities, value objects, domain events, policy rules
  application/     # Use cases, commands, queries, application services
  infrastructure/  # Repositories, ORM adapters, external service clients
  presentation/    # Controllers, request/response DTOs, route definitions
```

Business rules live in `domain/` and `application/` only. Controllers, HTTP frameworks, cloud SDKs, ORM details, and storage adapters must not appear in `domain/` or `application/` code.

---

## Source Layout

```
src/
  modules/
    identity-profile/
    group-management/
    group-membership/
    event-management/
    event-capture/
    event-chat/
    event-checklist/
    event-location/
    notifications/
    audit-security/
  shared/          # Shared value types, result types, interfaces
  infrastructure/  # Root DI container, shared DB connection, middleware
docs/
  architecture/    # This documentation
```

Shared code must be minimal and intentional. Do not put domain logic in `shared/`.

---

## Deployment Architecture

### Platform Defaults

| Concern | Default choice |
|---|---|
| Frontend | Azure Static Web Apps or Azure App Service |
| Backend API | Azure Container Apps (preferred) or Azure App Service |
| Background workers | Azure Container Apps Jobs or Azure Functions |
| Messaging | Azure Service Bus |
| Blob storage | Azure Blob Storage |
| Relational database | Azure PostgreSQL Flexible Server or Azure SQL |
| Secrets | Azure Key Vault (only when managed identity cannot be used directly) |
| Monitoring | Application Insights + Azure Monitor + Log Analytics |

### Identity and Access

- All services use **system-assigned managed identity** wherever Azure supports it.
- **Azure RBAC** at least privilege: never grant `Owner` or `Contributor` when a narrower role works.
- Static connection strings with shared keys are forbidden when managed identity is available.
- Secrets must not be baked into container images or committed to source control.

### Container Guidelines

- Multi-stage Dockerfile builds: build stage + minimal runtime stage.
- Images run as a non-root user.
- Runtime configuration via environment variables only.
- Expose only the port(s) the service actually listens on.
- Builds are deterministic and reproducible.

### Kubernetes Readiness

The deployment model targets Azure Container Apps today. The codebase is designed to be Kubernetes-compatible (stateless services, environment variable configuration, health endpoints) without introducing AKS-specific complexity unless explicitly required.

---

## Authentication

- All authenticated requests are validated against a token issued by **Microsoft Entra ID / External ID / B2C**.
- Token validation happens at the API gateway or edge middleware before any application code runs.
- Application code trusts the validated identity claims passed by middleware; it never re-validates tokens itself.
- No production authentication shortcuts are permitted. Test-only identity shortcuts must be clearly isolated and marked.

---

## Event-Scope Enforcement

This is the central privacy rule of the system:

> **Group membership alone never grants event access.**

Event access is controlled exclusively by explicit `EventInvitation` records persisted at event creation time. See [access-control.md](access-control.md) for the full access model.

### Group-Level Views

Group-level views show only:

- The list of events the requesting user is explicitly authorised to see.
- Event summaries (title, time, RSVP status) for those events.

Group-level views must **never** show:

- Chat content or previews.
- Checklist items or rollup counts.
- Location details.
- Collaboration activity summaries.
- Counts of or hints about events the user cannot access.

### Event-Scoped Collaboration

Chat, checklist, and location are each scoped exclusively to their event. A user who cannot view an event cannot view any of its collaboration data. This applies at the API layer, the application layer, and the domain layer simultaneously.

---

## Security and Privacy Rules

### Input Validation

All request DTOs are validated before use. Invalid state is rejected early, before any domain logic runs.

### Authorization Enforcement

Authorization is checked in application/domain logic, not only at route or middleware level. Sensitive operations verify the caller's permissions explicitly in code.

### Data Minimization

Endpoints return only the data required for their specific use case. Internal identifiers, email addresses, and personal data are omitted unless explicitly required.

### Error Handling

Errors returned to clients are safe, structured, and non-leaky. Stack traces, infrastructure details, secret values, and internal identifiers are never exposed in error responses.

### Logging

Structured logs with correlation IDs. Logged fields include: operation name, safe resource identifiers, request ID, timing, and error category.

Never log: tokens, secrets, passwords, raw sensitive event content, full transcripts or OCR results at broad log levels, or home addresses at broad log levels.

### Auditability

The `audit-security` module records sensitive operations including:

- Group ownership and admin role changes.
- Membership changes.
- Event creation, update, and cancellation.
- Invitation changes.
- Event visibility changes.
- Event location changes.
- Privileged access decisions.

---

## CI and Testing Requirements

Every feature, bug fix, authorization rule, privacy rule, and API endpoint must include automated tests. Code is not considered complete until tests exist and pass in GitHub Actions CI.

### CI Triggers

| Trigger | Required checks |
|---|---|
| Pull request | Install → lint → typecheck → unit tests → integration tests → API tests → coverage report |
| Merge to `main` | Full suite → build validation → migration verification → container build → smoke tests |

### Test Categories

| Category | Purpose |
|---|---|
| Unit | Domain rules, policy logic, validation, invite seeding, draft issue generation |
| Integration | Repositories, persistence, migrations, transaction boundaries |
| API | Request validation, auth, response contracts, error safety, hidden-event non-disclosure |
| Authorization/privacy | Access control matrix across all actor types |

See [testing.md](testing.md) for the full test strategy and [ci-cd.md](ci-cd.md) for CI/CD pipeline detail.

---

## Related Documents

| Document | Contents |
|---|---|
| [access-control.md](access-control.md) | Full authorization model, visibility rules, test matrix |
| [event-management.md](event-management.md) | Event domain, lifecycle, invitation seeding |
| [event-capture.md](event-capture.md) | Capture pipeline, AI adapter boundary, draft flow |
| [event-chat.md](event-chat.md) | Event-scoped chat design and authorization |
| [event-checklist.md](event-checklist.md) | Event-scoped checklist design and authorization |
| [event-location.md](event-location.md) | Event-scoped location design and privacy rules |
| [testing.md](testing.md) | Full test strategy, deterministic design, CI integration |
| [ci-cd.md](ci-cd.md) | GitHub Actions pipelines, quality gates, merge blockers |
| [module-template.md](module-template.md) | Template for new module documentation |
