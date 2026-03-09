# Nova-Circle — Event Checklist

## Module Responsibility

The `event-checklist` module provides a lightweight task list scoped exclusively to a single event. Checklist items are visible only to event invitees; no checklist data is exposed at the group level.

This module does **not**:

- Provide group-level or cross-event checklists.
- Aggregate, summarise, or roll up checklist completion data at the group level.
- Implement full project management features (no subtasks, no dependency chains, no time tracking).

---

## Scope Constraint

> Checklist is event-scoped only.

No API endpoint, query, or response schema may expose checklist data outside the event detail view. This applies to:

- Group event list responses.
- Group summary or dashboard views.
- Notification payloads (notification may indicate a checklist item was completed in a named event, but must not include item text if privacy policy prohibits it).
- Search results.

---

## Domain Model

### EventChecklist

One checklist per event. Created automatically when the first item is added.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Immutable |
| `eventId` | UUID | References `Event.id`; unique (one checklist per event) |
| `createdAt` | timestamp | Set on creation |

### EventChecklistItem

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Immutable |
| `checklistId` | UUID | References `EventChecklist.id` |
| `createdByUserId` | UUID | Who created the item |
| `text` | string | Item description; max 500 characters |
| `isDone` | boolean | Completion state; default `false` |
| `assignedToUserId` | UUID | Optional assignee; must have event access |
| `dueAt` | timestamp | Optional due date/time; nullable |
| `displayOrder` | integer | Ordering within the checklist; default 0 |
| `createdAt` | timestamp | Set on insert |
| `updatedAt` | timestamp | Updated on each change |
| `completedAt` | timestamp | When `isDone` was set to `true`; nullable |
| `completedByUserId` | UUID | Who marked the item done; nullable |

Items are not soft-deleted in the default model; hard deletion is used because checklist items do not carry audit significance comparable to messages. An audit event is still emitted on deletion.

---

## Authorization

### Access Rule

A user may access the checklist for an event if and only if:

- The user is the event creator, **or**
- The user has an `EventInvitation` for the event in state `invited`, `accepted`, `declined`, or `tentative`.

This check is performed by the `event-checklist` module by querying `EventInvitation` records via the `event-management` read interface. Group membership is not used as a proxy for access.

### Operation Authorization

| Operation | Required condition |
|---|---|
| Read items | Active event access |
| Add item | Active event access |
| Edit item text | Active event access AND item `createdByUserId` equals caller, OR event creator/admin |
| Mark item done/undone | Active event access |
| Assign item | Active event access AND target assignee also has event access |
| Set due date | Active event access AND item `createdByUserId` equals caller, OR event creator/admin |
| Reorder items | Active event access |
| Delete item | Item creator, event creator, or group `admin`/`owner` with event access |

---

## Allowed Operations

### Read Checklist

Returns all items for the event's checklist, ordered by `displayOrder`. Response includes:

- Item ID.
- Item text.
- Completion state and `completedAt`.
- Assignee user ID and display name (if assigned).
- Due date (if set).
- `createdByUserId`.

The response does not include assignee email, phone, or any personal data beyond display name.

### Add Item

Validates:
- Text is non-empty and within the character limit.
- Caller has active event access.

Persists the item. Assigns `displayOrder` as `max(existing) + 1` or allows the caller to specify. Publishes `ChecklistItemAdded` domain event.

### Edit Item Text

Validates:
- Text is non-empty and within the character limit.
- Caller is the item creator, the event creator, or a group admin/owner with event access.

Updates `text` and `updatedAt`.

### Mark Item Done

Validates:
- Caller has active event access.

Sets `isDone = true`, `completedAt` to current time, `completedByUserId` to the caller. Updates `updatedAt`. Publishes `ChecklistItemCompleted` domain event.

### Mark Item Undone

Validates:
- Caller has active event access.

Sets `isDone = false`, clears `completedAt` and `completedByUserId`. Updates `updatedAt`.

### Assign Item

Validates:
- Caller has active event access.
- Target assignee has an active `EventInvitation` for the event.

Updates `assignedToUserId`. An item may only be assigned to a user who has event access; assigning to a non-invitee is rejected.

### Delete Item

Validates:
- Caller is the item creator, the event creator, or a group admin/owner with event access.

Hard-deletes the item row. Publishes `ChecklistItemDeleted` domain event for audit.

### Reorder Items

Validates:
- Caller has active event access.
- Provided order contains all existing item IDs (no items are dropped).

Updates `displayOrder` for all items in the checklist atomically.

---

## Privacy Rules

- Checklist content is visible only to event invitees. It is never exposed at group level.
- Assignee personal data (email, phone) is never included in checklist API responses.
- Checklist item text is not logged at broad log levels.
- No checklist summary (completion counts, item counts) is exposed in group-level API responses.

---

## API Surface

All endpoints require authentication. Event access is verified before any data is returned or mutated.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/events/{eventId}/checklist` | Get the checklist and all items |
| `POST` | `/api/v1/events/{eventId}/checklist/items` | Add a new item |
| `PUT` | `/api/v1/events/{eventId}/checklist/items/{itemId}` | Update item (text, assignee, due date) |
| `POST` | `/api/v1/events/{eventId}/checklist/items/{itemId}/complete` | Mark item done |
| `DELETE` | `/api/v1/events/{eventId}/checklist/items/{itemId}/complete` | Mark item undone |
| `DELETE` | `/api/v1/events/{eventId}/checklist/items/{itemId}` | Delete item |
| `PUT` | `/api/v1/events/{eventId}/checklist/order` | Reorder all items |

### Error Responses

| Scenario | HTTP status |
|---|---|
| Unauthenticated | `401 Unauthorized` |
| Event not found or caller has no event access | `404 Not Found` |
| Caller authenticated but not authorized for the operation | `403 Forbidden` |
| Validation failure | `400 Bad Request` |
| Server error | `500 Internal Server Error` (safe message only) |

Using `404 Not Found` for "event exists but caller has no access" prevents confirming the existence of the event or its checklist to unauthorized callers.

---

## Domain Events Published

| Domain Event | Trigger | Subscribers |
|---|---|---|
| `ChecklistItemAdded` | New item persisted | `notifications` (if configured), `audit-security` |
| `ChecklistItemCompleted` | Item marked done | `audit-security` |
| `ChecklistItemDeleted` | Item hard-deleted | `audit-security` |

---

## Persistence

- `EventChecklist` and `EventChecklistItem` rows are stored in the relational database.
- An index on `(checklistId, displayOrder)` supports efficient ordered retrieval.
- Schema changes are applied via migrations run in CI.
- Reorder operations update all item `displayOrder` values in a single transaction to prevent partial reorder state.

---

## Required Tests

### Unit Tests

- `AddChecklistItemCommand` rejects empty text.
- `AddChecklistItemCommand` rejects text exceeding the character limit.
- `AssignItemCommand` rejects an assignee who has no event access.
- `MarkItemDoneCommand` sets `isDone`, `completedAt`, and `completedByUserId` correctly.
- `MarkItemUndoneCommand` clears `isDone`, `completedAt`, and `completedByUserId`.
- `DeleteItemCommand` is rejected for a caller who is neither item creator, event creator, nor admin/owner.
- `ReorderCommand` is rejected if the provided item ID list does not match all existing items.

### Authorization Tests

These tests are mandatory.

| Actor | Operation | Expected result |
|---|---|---|
| Active invitee | Read checklist | ✅ Returns items |
| Active invitee | Add item | ✅ Succeeds |
| Active invitee | Mark own item done | ✅ Succeeds |
| Removed invitee | Read checklist | ❌ `404 Not Found` |
| Removed invitee | Add item | ❌ `404 Not Found` |
| Non-invited group member | Read checklist | ❌ `404 Not Found` |
| New member (joined after event creation) | Read checklist | ❌ `404 Not Found` |
| Unauthenticated caller | Any operation | ❌ `401 Unauthorized` |
| Caller from different group | Any operation | ❌ `404 Not Found` |

### Integration Tests

- Adding an item persists the row with correct `checklistId`, `createdByUserId`, and `text`.
- Marking an item done and then undone correctly toggles `isDone` and `completedAt`.
- Reordering items updates all `displayOrder` values atomically; partial reorder is not possible.
- Deleting an item removes the row from the database.
- `ChecklistItemAdded` domain event is published after persist.

### Privacy Tests

- Group event list API response does not include checklist item count or completion state for any event.
- Assignee email and phone are not present in checklist API responses.

---

## Related Documents

- [access-control.md](access-control.md) — Event access model
- [event-management.md](event-management.md) — Event and invitation model
- [testing.md](testing.md) — Test strategy
- [overview.md](overview.md) — System architecture
