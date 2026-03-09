# Nova-Circle — Test Strategy

## Foundational Rule

> Every feature, bug fix, authorization rule, privacy rule, and API endpoint must include automated tests. Code is not considered complete until tests exist and pass in GitHub Actions CI.

This is not optional. A change that lacks tests for new behavior does not meet the definition of done.

---

## Test Categories

Nova-Circle requires four categories of automated tests. Every meaningful capability must have coverage in all applicable categories.

| Category | Purpose | Run in CI on |
|---|---|---|
| Unit | Domain rules, policy logic, validation, invite seeding, draft issues | PR and main |
| Integration | Repositories, persistence, migrations, transactions | PR and main |
| API | Request validation, auth, response contracts, error safety | PR and main |
| Authorization/privacy | Access control matrix, hidden event non-disclosure | PR and main |

---

## Unit Tests

Unit tests are fast, isolated, and do not touch a real database, real network, or any real external service.

### What to Test

- All domain rule methods on domain entities and value objects.
- All policy classes (`EventPolicy`, `EventInvitationPolicy`, etc.).
- Validation logic for all command and query DTOs.
- Invite seeding logic: snapshot of group members at creation time.
- Draft issue generation: all `DraftIssue` code paths.
- Checklist permission logic.
- Chat permission logic.
- Location validation logic.
- Access control matrix behavior (pure logic, no DB).
- Date/time parsing logic.
- State machine transitions (event status, invitation state).

### Practices

- Replace all external dependencies with deterministic fakes or stubs.
- Use an injected clock interface; never call `Date.now()` or `new Date()` directly in domain/application code.
- Use test data builders to construct domain objects; avoid inline object literals scattered across many tests.
- Each test must be independent of all others. Tests must not share mutable state.
- Tests must not depend on execution order.

### Example: Invite Seeding

```
given: group has members Alice, Bob, Carol
when: Alice creates an event and does not remove anyone
then: EventInvitation rows exist for Alice (accepted), Bob (invited), Carol (invited)

given: group has members Alice, Bob, Carol
when: Alice creates an event and removes Bob from the default list
then: EventInvitation rows exist for Alice (accepted), Carol (invited)
      no EventInvitation row exists for Bob
```

---

## Integration Tests

Integration tests verify that modules behave correctly when working against a real (or realistic in-process) database.

### What to Test

- Repository implementations: insert, update, query, delete.
- Persistence mappings: field values round-trip correctly.
- Migration correctness: schema bootstraps from scratch; no data loss on upgrade.
- Transaction boundaries: multi-step writes (event + invitations) are atomic; partial failures roll back.
- Outbox behavior (if used): domain events are persisted and consumed correctly.
- Authorization across persistence-backed flows: the group event list query returns only events the requesting user has access to; no events leak.

### Practices

- Use a dedicated test database (e.g., a Docker container running PostgreSQL or an in-memory compatible test database).
- Run migrations before each test run; do not assume schema state.
- Use isolated test state: each test inserts its own data and does not depend on data from another test.
- Use test data builders for all test fixtures.
- Clean up data between tests or use transactions that are rolled back after each test.

### Mandatory Integration Test: Event Visibility Isolation

This test is required and must pass on every PR:

```
given: group with members Alice, Bob, Carol, David
  and: Alice creates Event A (Bob and Carol invited; David excluded)
  and: David is added to the group after Event A is created
when: David queries the group event list
then: Event A does not appear in David's results
  and: no count or hint of Event A appears in David's results

when: Bob queries the group event list
then: Event A appears in Bob's results
```

---

## API Tests

API tests exercise the full request/response cycle through the HTTP layer. They may use an in-process test server or a real server started in the CI job.

### What to Test

- Request validation: invalid or missing fields return `400 Bad Request` with a structured error body.
- Authentication: requests without a valid token return `401 Unauthorized`.
- Authorization: requests that fail access control return the correct status (`403 Forbidden` or `404 Not Found` per policy).
- Response contracts: response bodies conform to the documented schema.
- Pagination: list endpoints return correctly paginated results.
- Safe error handling: server errors return `500` with a safe, non-leaky message body (no stack traces, no infrastructure details).
- Hidden event non-disclosure: inaccessible events do not appear in any list response, count, or summary.

### Required API Tests: Hidden Event Non-Disclosure

```
given: Event A exists in the group
  and: the requesting user has no EventInvitation for Event A
when: the user calls GET /api/v1/groups/{groupId}/events
then: Event A is absent from the response body
  and: the total count in the response does not include Event A
  and: no field in the response references Event A's ID, title, or any attribute

when: the user calls GET /api/v1/events/{eventAId}
then: the response is 404 Not Found
  and: the response body does not confirm or deny that Event A exists
```

---

## Authorization and Privacy Tests

These tests are **mandatory**, not optional. They form a regression suite that must pass on every PR. Any change that causes an authorization or privacy test to fail must be treated as a critical defect.

### Standard Actor Set

Every protected capability must be tested against this actor set:

| Actor | Description |
|---|---|
| `creator` | The user who created the event |
| `active_invitee` | A user with an active invitation (`invited`, `accepted`, `tentative`, `declined`) |
| `removed_invitee` | A user whose invitation has been set to `removed` |
| `non_invited_member` | A current group member who was never invited to this event |
| `new_member` | A user who joined the group after the event was created |
| `former_member` | A user who has left or been removed from the group |
| `unauthenticated` | A caller with no valid token |
| `other_group_member` | An authenticated user who is a member of a different group |

### Authorization Test Matrix (Event-Level)

| Actor | View event | RSVP | Edit event | Cancel event |
|---|---|---|---|---|
| `creator` | ✅ | ✅ (owns) | ✅ | ✅ |
| `active_invitee` | ✅ | ✅ | ❌ | ❌ |
| `removed_invitee` | ❌ | ❌ | ❌ | ❌ |
| `non_invited_member` | ❌ | ❌ | ❌ | ❌ |
| `new_member` | ❌ | ❌ | ❌ | ❌ |
| `former_member` | ❌ | ❌ | ❌ | ❌ |
| `unauthenticated` | 401 | 401 | 401 | 401 |
| `other_group_member` | ❌ | ❌ | ❌ | ❌ |

✅ = succeeds, ❌ = `403 Forbidden` or `404 Not Found` per policy, 401 = `401 Unauthorized`

The same matrix must be applied for each collaboration module (chat, checklist, location) with the same actor set.

---

## Event Capture Tests

### Required Tests

- Complete text input with all required fields creates an event (not a draft).
- Text input missing `title` creates a draft with `missing_title` issue.
- Text input missing start date creates a draft with `missing_start_date` issue.
- Text input with `endAt` before `startAt` creates a draft with `invalid_time_range` issue.
- Text referencing a group the user does not belong to creates a draft with `unauthorized_group_access` issue.
- Low-confidence extraction on any field creates a draft with `low_confidence_extraction` issue; the pipeline does not promote the event.
- Voice input passes through the same downstream pipeline as text after the STT fake returns a transcript.
- Image input passes through the same downstream pipeline after the image extraction fake returns candidates.
- Updating a draft with corrected fields re-runs validation; all issues resolved → promotes to event.
- A fake STT adapter returning an empty transcript creates a draft with `missing_title` and `missing_start_date`.

### Deterministic Testing Rule

No capture pipeline test may make a real network call to any AI service, OCR service, or speech-to-text service.

All AI, STT, OCR, and storage adapters must be injected as interfaces. In tests, these are replaced with deterministic fakes that return predefined results.

---

## Migration and Schema Tests

When any schema change is introduced:

- The migration must run in CI against an empty database (bootstrap from scratch).
- The migration must run in CI against a database that has previous migrations applied (incremental upgrade).
- Persistence behavior must be tested after the migration runs.
- Rollback behavior must be documented if the migration is destructive.

CI must fail if migrations cannot be applied to an empty schema or to the schema from the previous migration state.

---

## Test Data Strategy

### Use Builders

All test data is constructed using builder objects or factory functions. Do not write inline object literals for complex domain objects in test assertions.

```
// Preferred
const event = EventBuilder.forGroup(groupId).withCreator(aliceId).build();

// Avoid
const event = { id: 'some-id', groupId: '...', createdByUserId: '...', ... };
```

### Deterministic Clocks

All code that reads the current time uses an injected clock interface. In tests, the clock is replaced with a deterministic fake that returns a fixed, controlled time.

### Fake Identity Providers

Tests that require an authenticated identity use a fake token validator that returns a predefined identity. No real Entra ID or B2C token is required in CI.

### Fake Event Bus and Storage

When code publishes domain events or writes to blob storage, tests use in-process fakes that capture published events and stored blobs without network calls.

---

## Definition of Done

A change is only done when all of the following are true:

- [ ] The code compiles or builds.
- [ ] Unit tests are added or updated for all new or changed behavior.
- [ ] Integration tests are added or updated for all persistence changes.
- [ ] API tests are added or updated for all new or changed endpoints.
- [ ] Authorization and privacy tests cover all relevant actors from the standard actor set.
- [ ] All tests pass in CI.
- [ ] If schema changed: migrations verified in CI.
- [ ] If endpoints changed: API contracts updated.
- [ ] No authorization or privacy test is disabled or commented out.
- [ ] No test makes a live call to an external AI, STT, OCR, or cloud service.

---

## Related Documents

- [ci-cd.md](ci-cd.md) — CI/CD pipeline, quality gates, and merge blockers
- [access-control.md](access-control.md) — Authorization model and test matrix
- [event-management.md](event-management.md) — Event domain and required tests
- [event-capture.md](event-capture.md) — Capture pipeline and deterministic test design
- [event-chat.md](event-chat.md) — Chat authorization tests
- [event-checklist.md](event-checklist.md) — Checklist authorization tests
- [event-location.md](event-location.md) — Location authorization tests
- [overview.md](overview.md) — System architecture
