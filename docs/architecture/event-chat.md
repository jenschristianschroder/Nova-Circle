# Nova-Circle — Event Chat

## Module Responsibility

The `event-chat` module provides text-based messaging between event invitees, scoped exclusively to a single event. It does not provide group-level messaging, cross-event search, or any aggregated view of chat activity.

This module does **not**:

- Provide group-level chat.
- Surface any chat data (messages, counts, previews) outside the event detail view.
- Allow attachments unless explicitly authorised by a future product decision.
- Hard-delete messages immediately (soft delete only).

---

## Scope Constraint

> Chat is event-scoped only.

No API endpoint, query, or response schema may expose chat content or chat activity at the group level. This constraint is absolute and applies to:

- Group event list responses.
- Group summary or dashboard views.
- Notification payloads (notification may say "new message in [event]" but must not include message content).
- Search results.

---

## Domain Model

### EventChatThread

An `EventChatThread` is created automatically when an event is created or on first message, depending on product preference. There is one thread per event.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Immutable |
| `eventId` | UUID | References `Event.id`; unique (one thread per event) |
| `createdAt` | timestamp | Set on creation |

### EventChatMessage

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Immutable |
| `threadId` | UUID | References `EventChatThread.id` |
| `authorUserId` | UUID | The user who posted the message |
| `content` | string | Message text; max 4000 characters |
| `postedAt` | timestamp | When the message was posted |
| `editedAt` | timestamp | When the message was last edited; nullable |
| `deletedAt` | timestamp | Soft delete timestamp; nullable |
| `deletedByUserId` | UUID | Who performed the soft delete; nullable |

Messages with a non-null `deletedAt` are not returned in message list queries. The record is retained for audit purposes.

---

## Authorization

### Access Rule

A user may access the chat thread for an event if and only if:

- The user is the event creator, **or**
- The user has an `EventInvitation` for the event in state `invited`, `accepted`, `declined`, or `tentative`.

This check must be performed by the `event-chat` module itself, querying `EventInvitation` records via the `event-management` read interface. The check is not delegated to the caller or assumed from group membership.

### Operation Authorization

| Operation | Required condition |
|---|---|
| Read messages | Active event access (see above) |
| Post message | Active event access |
| Edit own message | Active event access AND message `authorUserId` equals caller |
| Soft-delete own message | Active event access AND message `authorUserId` equals caller |
| Soft-delete any message | Event creator OR group `admin`/`owner` with event access |

No operation bypasses the event access check. A group `admin` who has no `EventInvitation` for the event has no access to the chat thread.

---

## Allowed Operations

### Read Messages

Returns paginated messages for the thread in chronological order. Soft-deleted messages are excluded. The response includes:

- Message ID.
- Author user ID and display name.
- Message content.
- `postedAt` timestamp.
- `editedAt` timestamp (if edited).

The response does not include author email, author phone, or any other personal data beyond display name.

### Post Message

Validates that:
- Content is non-empty and within the character limit.
- Caller has active event access.

Persists the message. Publishes a `ChatMessagePosted` domain event (consumed by `notifications`).

### Edit Message

Validates that:
- Content is non-empty and within the character limit.
- Caller is the message author.
- Caller has active event access.
- Message has not been soft-deleted.

Updates `content` and sets `editedAt`. Does not overwrite `postedAt`. Does not store message edit history in the default model.

### Soft Delete Message

Validates that:
- Caller is the author, or is the event creator or group admin/owner with event access.
- Message has not already been soft-deleted.

Sets `deletedAt` to the current time and `deletedByUserId` to the caller. Does not remove the row from the database.

---

## Privacy Rules

- Chat content is visible only to event invitees. It is never exposed at group level.
- Message content is not included in notification payloads. Notification may indicate that a new message exists in a named event; it must not quote the message text.
- Chat content is not logged in full at broad log levels. Structured logs record operation name, message ID, thread ID, author ID, and timing — not message content.
- Soft-deleted messages are not served to clients, but are retained in the database for the audit module to read if policy requires.
- Author personal data (email, phone) is never included in chat API responses.

---

## API Surface

All endpoints require authentication. The event access check is performed before any data is returned or mutated.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/events/{eventId}/chat/messages` | List messages (paginated) |
| `POST` | `/api/v1/events/{eventId}/chat/messages` | Post a new message |
| `PUT` | `/api/v1/events/{eventId}/chat/messages/{messageId}` | Edit own message |
| `DELETE` | `/api/v1/events/{eventId}/chat/messages/{messageId}` | Soft-delete message |

### Pagination

List endpoint supports cursor-based pagination. Parameters:

- `limit` (default 50, max 100)
- `before` (message ID or timestamp cursor for loading older messages)
- `after` (message ID or timestamp cursor for loading newer messages)

### Error Responses

| Scenario | HTTP status |
|---|---|
| Unauthenticated | `401 Unauthorized` |
| Event or thread not found, or caller has no event access | `404 Not Found` |
| Caller authenticated but not authorised for the operation | `403 Forbidden` |
| Validation failure | `400 Bad Request` |
| Server error | `500 Internal Server Error` (safe message only) |

Using `404 Not Found` for "event exists but caller has no access" prevents confirming the existence of the event or thread to unauthorised callers.

---

## Domain Events Published

| Domain Event | Trigger | Subscribers |
|---|---|---|
| `ChatMessagePosted` | New message persisted | `notifications`, `audit-security` |
| `ChatMessageDeleted` | Message soft-deleted | `audit-security` |

---

## Persistence

- `EventChatThread` and `EventChatMessage` rows are stored in the relational database.
- An index on `(threadId, postedAt)` supports efficient chronological pagination.
- An index on `(threadId, deletedAt)` is not necessary; filtering on `deletedAt IS NULL` combined with the primary index is sufficient at typical message volumes.
- Schema changes are applied via migrations run in CI.
- Message content is stored as plain text. No server-side encryption beyond database-level encryption at rest (Azure default).

---

## Required Tests

### Unit Tests

- `PostMessageCommand` rejects content that exceeds the character limit.
- `PostMessageCommand` rejects empty content.
- `EditMessageCommand` rejects edits by a user who is not the message author.
- `SoftDeleteMessageCommand` sets `deletedAt` and `deletedByUserId` correctly.
- `SoftDeleteMessageCommand` is rejected if message is already soft-deleted.
- Event creator can soft-delete any message in the thread.
- Group `admin`/`owner` with event access can soft-delete any message.

### Authorization Tests

These tests are mandatory.

| Actor | Operation | Expected result |
|---|---|---|
| Active invitee | Read messages | ✅ Returns messages |
| Active invitee | Post message | ✅ Succeeds |
| Removed invitee | Read messages | ❌ `404 Not Found` |
| Removed invitee | Post message | ❌ `404 Not Found` |
| Non-invited group member | Read messages | ❌ `404 Not Found` |
| Non-invited group member | Post message | ❌ `404 Not Found` |
| New member (joined after event creation) | Read messages | ❌ `404 Not Found` |
| Unauthenticated caller | Any operation | ❌ `401 Unauthorized` |
| Caller from different group | Any operation | ❌ `404 Not Found` |

### Integration Tests

- Posting a message persists the row with correct `threadId`, `authorUserId`, `content`, and `postedAt`.
- Soft-deleting a message sets `deletedAt`; the message is excluded from subsequent list queries.
- Cursor-based pagination returns messages in chronological order without duplicates across pages.
- `ChatMessagePosted` domain event is published after persist.

### Privacy Tests

- Message list response does not include author email or phone number.
- Group event list API response does not include any chat content or message count for the event.
- Notification payload for `ChatMessagePosted` does not include message content.

---

## Related Documents

- [access-control.md](access-control.md) — Event access model
- [event-management.md](event-management.md) — Event and invitation model
- [testing.md](testing.md) — Test strategy
- [overview.md](overview.md) — System architecture
