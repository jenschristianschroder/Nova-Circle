# Nova-Circle — Event Management

## Module Responsibility

The `event-management` module is the authoritative source of truth for event scheduling, the event invitation list, event lifecycle state, and event visibility. It owns the `Event` aggregate and the `EventInvitation` aggregate.

This module does **not** own:

- Chat data (owned by `event-chat`).
- Checklist data (owned by `event-checklist`).
- Location data (owned by `event-location`).
- Draft state from natural language / voice / image capture (owned by `event-capture`).
- Group membership (owned by `group-membership`).
- Notifications triggered by events (owned by `notifications`).

---

## Domain Model

### Event

`Event` is the scheduling core. It is deliberately narrow; collaboration concerns are in separate event-linked models.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Immutable after creation |
| `groupId` | UUID | The group this event belongs to |
| `createdByUserId` | UUID | Creator; never changes |
| `title` | string | Required; max 200 characters |
| `description` | string | Optional; nullable |
| `startAt` | timestamp with timezone | Required |
| `endAt` | timestamp with timezone | Required; must be after `startAt` |
| `status` | enum | `scheduled`, `cancelled` |
| `createdAt` | timestamp | Set on insert; immutable |
| `updatedAt` | timestamp | Updated on every write |

The `Event` table does not store chat, checklist items, or location inline. These are separate linked tables.

### EventInvitation

`EventInvitation` is the authoritative record of a user's relationship to an event. Group membership is never used as a proxy for event access after the event has been saved.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Immutable after creation |
| `eventId` | UUID | References `Event.id` |
| `userId` | UUID | The invited user |
| `state` | enum | `invited`, `accepted`, `declined`, `tentative`, `removed` |
| `invitedAt` | timestamp | When the invitation was created |
| `respondedAt` | timestamp | When the user last changed their state; nullable |

Allowed state transitions:

```
invited  → accepted
invited  → declined
invited  → tentative
invited  → removed
accepted → declined
accepted → tentative
accepted → removed
declined → accepted
declined → tentative
declined → removed
tentative → accepted
tentative → declined
tentative → removed
```

State `removed` is terminal. A removed invitation cannot be reactivated; a new invitation must be created if policy allows reinviting.

### EventDraft

`EventDraft` is owned by `event-capture` but is referenced here for completeness. A draft is not a live event; it has no invitation list and is not visible in group event lists.

---

## Event Lifecycle

```
[Created] → scheduled
scheduled → cancelled
```

Only the event creator, or a group `admin` or `owner` (if product policy grants this), may cancel an event. A cancelled event remains in the database for audit purposes. Hard deletion of events is not supported in the default model.

### Creating an Event

The `CreateEventCommand` flow:

1. Validate the caller is an authenticated group member of `groupId`.
2. Validate all required fields (`title`, `startAt`, `endAt`).
3. Validate `startAt < endAt`.
4. Query all current `GroupMember` records for `groupId` — this is the **invitation snapshot**.
5. Remove any members the creator has explicitly excluded.
6. Begin a database transaction:
   a. Insert the `Event` row.
   b. Insert one `EventInvitation` row per remaining member (state = `invited`).
   c. Insert an `EventInvitation` row for the creator (state = `accepted`).
7. Commit the transaction.
8. Publish a domain event `EventCreated` (picked up by `notifications` and `audit-security`).

If the transaction fails, no event or invitations are persisted. There is no partial state.

### Updating an Event

The `UpdateEventCommand` flow:

1. Verify the caller has `EventInvitation` access or is the creator.
2. Verify the event is in state `scheduled`.
3. Apply field updates (title, description, startAt, endAt).
4. Validate updated field constraints.
5. Persist the update.
6. Publish `EventUpdated` domain event.

Updating an event does **not** automatically add or remove invitations. Invitation management is a separate operation.

### Cancelling an Event

The `CancelEventCommand` flow:

1. Verify the caller is the creator, or has `admin`/`owner` role in the group (if policy allows).
2. Transition event `status` to `cancelled`.
3. Persist the change.
4. Publish `EventCancelled` domain event (triggers notifications to all active invitees).

### Managing Invitations

Invitations are managed through explicit commands:

- `InviteUserToEventCommand` — adds a new `EventInvitation` (state = `invited`) for a user. Caller must be creator or group `admin`/`owner`.
- `RemoveEventInvitationCommand` — transitions an existing `EventInvitation` to state `removed`. Caller must be creator or group `admin`/`owner`.
- `RespondToEventInvitationCommand` — transitions the caller's own invitation to `accepted`, `declined`, or `tentative`.

---

## Aggregate Boundaries

`Event` and its `EventInvitation` records form a single consistency boundary. All writes to an event and its invitation list are transactional.

The following are outside the `event-management` aggregate and are separate linked models owned by their respective modules:

- `EventChatThread` / `EventChatMessage` (owned by `event-chat`)
- `EventChecklist` / `EventChecklistItem` (owned by `event-checklist`)
- `EventLocation` (owned by `event-location`)

These linked models receive the `EventId` as a foreign key. They must verify event access using the same `EventInvitation`-based check before serving any data.

---

## Invitation Seeding Detail

At event creation, the invitation snapshot is taken from live `GroupMember` records. This snapshot behavior means:

| Scenario | Result |
|---|---|
| Member exists at creation time | Added to default invite list |
| Creator removes member before save | Member excluded from invite list |
| Member joins group after creation | Not in invite list; must be explicitly added |
| Member leaves group after creation | Their invitation is not automatically removed (handled by membership policy) |
| Member is removed from group | Application must apply access policy explicitly (e.g., transition to `removed`) |

The snapshot is not stored as a separate record. The persisted `EventInvitation` rows ARE the snapshot. There is no second source of truth.

---

## Visibility and Query Rules

All queries that return event data must filter by the requesting user's explicit access:

```sql
SELECT e.*
FROM Event e
WHERE e.groupId = :groupId
  AND (
    e.createdByUserId = :userId
    OR EXISTS (
      SELECT 1 FROM EventInvitation ei
      WHERE ei.eventId = e.id
        AND ei.userId = :userId
        AND ei.state IN ('invited', 'accepted', 'declined', 'tentative')
    )
  )
```

This filter is applied at the repository layer, not the presentation layer. The presentation layer must never receive a full event list and filter it after the fact; the query itself must be restricted.

---

## Domain Events Published

| Domain Event | Trigger | Subscribers |
|---|---|---|
| `EventCreated` | Event successfully saved | `notifications`, `audit-security` |
| `EventUpdated` | Event details changed | `notifications`, `audit-security` |
| `EventCancelled` | Event status set to `cancelled` | `notifications`, `audit-security` |
| `InvitationAdded` | New `EventInvitation` created | `notifications`, `audit-security` |
| `InvitationStateChanged` | RSVP state updated | `notifications`, `audit-security` |
| `InvitationRemoved` | Invitation transitioned to `removed` | `notifications`, `audit-security` |

Domain events are published after the database transaction commits. Use the outbox pattern when publishing to Azure Service Bus to ensure at-least-once delivery.

---

## API Surface

All endpoints require authentication. Authorization is verified in application logic before any data is returned or mutated.

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/groups/{groupId}/events` | Create a new event |
| `GET` | `/api/v1/groups/{groupId}/events` | List events the caller can access |
| `GET` | `/api/v1/events/{eventId}` | Get event detail |
| `PUT` | `/api/v1/events/{eventId}` | Update event |
| `POST` | `/api/v1/events/{eventId}/cancel` | Cancel event |
| `GET` | `/api/v1/events/{eventId}/invitations` | List invitations (caller must have access) |
| `POST` | `/api/v1/events/{eventId}/invitations` | Add invitation |
| `DELETE` | `/api/v1/events/{eventId}/invitations/{userId}` | Remove invitation |
| `PUT` | `/api/v1/events/{eventId}/invitations/me` | RSVP (caller updates their own invitation) |

### Error Responses

| Scenario | HTTP status |
|---|---|
| Unauthenticated | `401 Unauthorized` |
| Event exists but caller has no access | `404 Not Found` (do not confirm existence) |
| Caller authenticated but not authorised for the operation | `403 Forbidden` |
| Validation failure | `400 Bad Request` with structured error body |
| Server error | `500 Internal Server Error` with safe, opaque message |

Using `404 Not Found` for "event exists but caller has no access" prevents confirming the existence of events to unauthorised callers.

---

## Persistence

- Relational database (Azure PostgreSQL Flexible Server or Azure SQL).
- All multi-step writes (event + invitations) are wrapped in a single database transaction.
- Schema changes are managed via migrations run in CI.
- Repository interfaces are defined in `application/`; implementations are in `infrastructure/`.
- Queries use parameterized statements; no string concatenation.
- Optimistic concurrency (`updatedAt` timestamp check) for event updates to prevent lost writes.

---

## Required Tests

### Unit Tests

- `CreateEventCommand` seeds all current group members as default invitees.
- Creator can remove members from invite list before save.
- `CreateEventCommand` fails if `startAt >= endAt`.
- `CreateEventCommand` fails if `groupId` does not correspond to a group the caller is a member of.
- Invitation state transition rules: valid and invalid transitions.
- `CancelEventCommand` rejects callers without creator or admin/owner role.

### Integration Tests

- Creating an event persists `Event` row and all `EventInvitation` rows atomically.
- Failed transaction rolls back both event and invitations.
- New group member added after event creation has no invitation row.
- Group event list query excludes events the requesting user has no invitation for.

### Authorization Tests

See [access-control.md](access-control.md) for the full test matrix. At minimum:

- Creator can view event.
- Active invitee can view event.
- Removed invitee cannot view event.
- Non-invited group member cannot view event.
- New member (joined after creation) cannot view event.
- Unauthenticated caller receives `401`.
- Caller from a different group receives `404`.

---

## Related Documents

- [access-control.md](access-control.md) — Full authorization model
- [event-capture.md](event-capture.md) — Draft creation and capture pipeline
- [event-chat.md](event-chat.md) — Event-scoped chat
- [event-checklist.md](event-checklist.md) — Event-scoped checklist
- [event-location.md](event-location.md) — Event-scoped location
- [testing.md](testing.md) — Test strategy
