# Nova-Circle — Module Documentation Template

This file is the authoritative template for documenting a new module in Nova-Circle. Copy it, rename it, and fill in every section. Do not leave placeholder text. Do not skip sections.

Sections marked `[REQUIRED]` must be completed before the module documentation is considered done. Sections marked `[IF APPLICABLE]` may be omitted only if they genuinely do not apply to this module, with a brief note explaining why.

---

# [Module Name]

> One sentence describing the module's primary responsibility.

## Module Responsibility [REQUIRED]

Describe in concrete terms what this module owns. Be explicit about:

- The domain entities and aggregates this module owns.
- The operations this module is responsible for.
- The authorisation decisions this module makes.

Then state explicitly what this module does **not** do. This negative scope is as important as the positive scope.

This module does **not**:

- [List things this module explicitly does not own or handle]
- [Include references to the module that owns each excluded concern]

---

## Scope Constraint [REQUIRED for collaboration modules]

State the exact scope boundary. For event-scoped modules, the constraint is:

> [Feature name] is event-scoped only.

List all contexts where this module's data must **not** appear:

- Group-level event list responses.
- Group summary or dashboard views.
- Notification payloads (state the rule: may reference event, must not include content).
- Search results.
- Any other surface that the module's data must not leak to.

---

## Domain Model [REQUIRED]

List all entities and value objects owned by this module. For each entity, provide a field table:

### [EntityName]

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Immutable |
| `fieldName` | type | Description, constraints, nullable? |

Include:

- Field types.
- Nullability.
- Character limits for string fields.
- Enum values for enum fields.
- Immutability constraints (e.g., "Set on insert; immutable").
- Foreign key references.

If the entity has a state machine, describe it:

```
state1 → state2
state1 → state3
state2 → state3 (condition)
```

---

## Authorization [REQUIRED]

### Access Rule

State the exact access rule for reading this module's data. Example:

> A user may access [feature] for an event if and only if they are the event creator OR they have an `EventInvitation` for the event in state `invited`, `accepted`, `declined`, or `tentative`.

State explicitly that group membership is not used as a proxy for access.

### Operation Authorization

Provide a table of operations and the required conditions for each:

| Operation | Required condition |
|---|---|
| Read [resource] | [condition] |
| Create [resource] | [condition] |
| Update [resource] | [condition] |
| Delete [resource] | [condition] |

---

## Allowed Operations [REQUIRED]

For each operation, describe:

1. What is validated before the operation runs.
2. What is persisted or mutated.
3. What domain event is published (if any).

Use a heading per operation:

### [OperationName]

Validates:
- [validation rule 1]
- [validation rule 2]

Persists:
- [what is written to the database]

Publishes:
- `[DomainEventName]` domain event.

---

## Privacy Rules [REQUIRED]

List every privacy constraint that applies to this module's data. Be explicit about:

- What data is visible only to specific actors.
- What data must never be logged.
- What data must never appear in group-level responses.
- What data must never be included in notification payloads.
- Any elevated sensitivity (e.g., home addresses, virtual meeting credentials).

---

## API Surface [REQUIRED]

List all HTTP endpoints provided by this module.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/...` | Description |
| `POST` | `/api/v1/...` | Description |

State the authentication requirement for all endpoints (always required unless documented otherwise).

### Error Responses

| Scenario | HTTP status |
|---|---|
| Unauthenticated | `401 Unauthorized` |
| Resource not found or caller has no access | `404 Not Found` |
| Authorised but not permitted for this operation | `403 Forbidden` |
| Validation failure | `400 Bad Request` |
| Server error | `500 Internal Server Error` |

State which error codes are used for "event exists but caller has no access" scenarios and why (non-disclosure of existence).

---

## Domain Events Published [IF APPLICABLE]

| Domain Event | Trigger | Subscribers |
|---|---|---|
| `[EventName]` | [When it is published] | [Which modules subscribe] |

If this module publishes no domain events, state that explicitly.

---

## Persistence [REQUIRED]

Describe:

- Which tables this module owns.
- Which indexes are defined and why.
- How schema changes are managed (migrations in CI).
- Whether writes are wrapped in transactions, and why.
- Any concurrency considerations (optimistic locking, etc.).

---

## Required Tests [REQUIRED]

List the required tests for this module. Tests must be complete and specific — do not write "test authorization" without listing which actors and operations are tested.

### Unit Tests

List each unit test case.

### Authorization Tests

These tests are mandatory. Use the standard actor set from [testing.md](testing.md).

| Actor | Operation | Expected result |
|---|---|---|
| `creator` | [operation] | ✅ or ❌ + status code |
| `active_invitee` | [operation] | ✅ or ❌ + status code |
| `removed_invitee` | [operation] | ❌ `404 Not Found` |
| `non_invited_member` | [operation] | ❌ `404 Not Found` |
| `new_member` | [operation] | ❌ `404 Not Found` |
| `unauthenticated` | [operation] | ❌ `401 Unauthorized` |
| `other_group_member` | [operation] | ❌ `404 Not Found` |

### Integration Tests

List each integration test case.

### Privacy Tests

List each privacy test case, including:

- What data must not appear in group-level responses.
- What data must not be included in logs.

---

## Related Documents [REQUIRED]

- [access-control.md](access-control.md) — Event access model
- [event-management.md](event-management.md) — Event and invitation model
- [testing.md](testing.md) — Test strategy and standard actor set
- [overview.md](overview.md) — System architecture and module boundaries
- [Any other directly related modules]

---

## Checklist Before Merging This Document [REQUIRED]

- [ ] All `[REQUIRED]` sections are complete with no placeholder text.
- [ ] All `[IF APPLICABLE]` sections are either completed or explicitly marked as not applicable with a reason.
- [ ] Authorization access rule is stated explicitly (not derived from group membership).
- [ ] Negative scope (what this module does not own) is listed.
- [ ] Privacy constraints are listed explicitly.
- [ ] All API endpoints are listed with their error response matrix.
- [ ] Required tests cover the standard actor set from [testing.md](testing.md).
- [ ] Privacy tests cover group-level non-disclosure.
- [ ] Domain events are listed or explicitly stated as none.
- [ ] Related documents section is filled in.
