# Nova-Circle — Event Sharing

## Module Responsibility

The `event-sharing` module enables a user to share their **personal** events (events with no group scope) to one or more groups with a configurable visibility level. Sharing creates an `event_shares` row that links the event to a target group and controls how much event detail is visible to group members.

This module does **not**:

- Allow sharing of group-scoped events (those already belong to a group).
- Allow non-owners to manage shares.
- Derive event access from group membership alone.

---

## Scope Constraint

> Sharing is restricted to personal events only.

Group-scoped events (where `Event.groupId` is not null) cannot be shared because they are already associated with a group. Only the event owner may create, update, revoke, or list shares for their personal events.

---

## Domain Model

### EventShare

One `EventShare` record per (event, group) pair.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `eventId` | UUID | References `Event.id`; must be a personal event (`Event.groupId IS NULL`) |
| `groupId` | UUID | References `Group.id`; the target group for sharing |
| `visibilityLevel` | enum | `busy`, `title`, or `details` — controls how much event data group members see |
| `sharedByUserId` | UUID | References `UserProfile.id`; who created the share |
| `sharedAt` | timestamp | When the share was created |
| `updatedAt` | timestamp | When the share was last modified |

Unique constraint: `(eventId, groupId)` — an event can be shared to a given group at most once.

### Visibility Levels

| Level | Visible to group members |
|---|---|
| `busy` | Time slot only (no title, no description, no status) |
| `title` | Title and status (no description) |
| `details` | Title, description, status, and other event detail |

---

## Authorization

### Explicit Authorization Rule (`EventSharePolicy`)

All operations on the `event_shares` table are gated by explicit authorization checks in the application layer via `EventSharePolicy`. No reliance on database-level security, route-level guards, or UI checks alone.

A caller may manage shares for an event if and only if **all** of the following are true:

1. The event exists.
2. The event is a personal event (`Event.groupId === null`).
3. The caller is the event owner (`Event.ownerId === caller.userId`).

For **creating** a share, an additional condition applies:

4. The caller must be a current member of the target group.

These rules are enforced by `EventSharePolicy.assertOwnerOfPersonalEvent()` and `EventSharePolicy.assertGroupMembership()`, which are called by every use case before any persistence operation.

### Operation Authorization

| Operation | Required condition |
|---|---|
| Create share | Event owner + group member of target group |
| Update share visibility | Event owner |
| Revoke (delete) share | Event owner |
| List shares | Event owner |

### Non-Owner Access

A user who is **not** the event owner receives `403 Forbidden` for all share operations, regardless of their group membership or role.

A user who is the event owner but **not** a member of the target group receives `403 Forbidden` when attempting to create a share to that group. They may still update or revoke existing shares to that group (even if they have since left the group), because they own the event data.

---

## Authorization Test Matrix

The following test cases are **mandatory** for event-sharing operations.

| Actor | Create share | Update share | Revoke share | List shares |
|---|---|---|---|---|
| Event owner + group member | ✅ | ✅ | ✅ | ✅ |
| Event owner + not group member | ❌ 403 | ✅ | ✅ | ✅ |
| Non-owner group member | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |
| Non-owner non-member | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |
| Unauthenticated caller | ❌ 401 | ❌ 401 | ❌ 401 | ❌ 401 |
| Non-existent event | ❌ 404 | ❌ 404 | ❌ 404 | ❌ 404 |
| Group-scoped event | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |

---

## API Surface

All endpoints require authentication.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/events/{eventId}/shares` | Share event to a group |
| `GET` | `/api/v1/events/{eventId}/shares` | List all shares for the event |
| `PATCH` | `/api/v1/events/{eventId}/shares/{shareId}` | Update share visibility level |
| `DELETE` | `/api/v1/events/{eventId}/shares/{shareId}` | Revoke (delete) a share |

### Request Validation

- `eventId` and `shareId` must be valid UUIDs.
- `groupId` (POST body) must be a valid UUID.
- `visibilityLevel` (POST / PATCH body) must be one of `busy`, `title`, `details`.

### Error Responses

| Scenario | HTTP status |
|---|---|
| Unauthenticated | `401 Unauthorized` |
| Event not found | `404 Not Found` |
| Event is group-scoped | `403 Forbidden` |
| Caller is not event owner | `403 Forbidden` |
| Caller is not a member of target group (POST) | `403 Forbidden` |
| Duplicate share (same event + group) | `409 Conflict` |
| Validation failure | `400 Bad Request` |
| Server error | `500 Internal Server Error` (safe message only) |

---

## Audit Logging

All share operations are recorded in the audit log:

| Action | Audit Event |
|---|---|
| Create share | `event_share.created` |
| Update visibility | `event_share.updated` |
| Revoke share | `event_share.revoked` |

Each audit record includes: `actorId`, `resourceType: 'event_share'`, `resourceId`, `groupId`, and relevant metadata (eventId, visibilityLevel).

---

## Persistence

- `event_shares` table in the relational database.
- Created by migration `20260328000010_personal_event_ownership.ts`.
- Unique constraint `(event_id, group_id)` prevents duplicate shares.
- Indexes on `group_id` and `shared_by_user_id` for query performance.
- All persistence operations are reached only after `EventSharePolicy` authorization checks pass in the application layer.

---

## Required Tests

### Unit Tests (EventSharePolicy)

- `assertOwnerOfPersonalEvent` throws `NOT_FOUND` when event is null.
- `assertOwnerOfPersonalEvent` throws `FORBIDDEN` when event is group-scoped.
- `assertOwnerOfPersonalEvent` throws `FORBIDDEN` when caller is not owner.
- `assertOwnerOfPersonalEvent` does not throw when caller is owner of a personal event.
- `assertGroupMembership` throws `FORBIDDEN` when membership is false.
- `assertGroupMembership` does not throw when membership is true.

### Unit Tests (Use Cases)

- ShareEventToGroupUseCase: NOT_FOUND, FORBIDDEN (group event, non-owner, non-member), CONFLICT, success.
- UpdateEventShareUseCase: NOT_FOUND, FORBIDDEN (group event, non-owner), share not found, success.
- RevokeEventShareUseCase: NOT_FOUND, FORBIDDEN (group event, non-owner), share not found, success.
- ListEventSharesUseCase: NOT_FOUND, FORBIDDEN (group event, non-owner), success.

### API Tests

- All CRUD endpoints test `401`, `403`, `404`, `400`, and success responses.
- Non-owner access is explicitly tested for POST, PATCH, DELETE, and GET.

### Integration Tests

- Create, find, update, delete flows against the database.
- Unique constraint prevents duplicate shares.

---

## Related Documents

- [access-control.md](access-control.md) — Event access model
- [event-management.md](event-management.md) — Event and invitation model
- [testing.md](testing.md) — Test strategy
- [overview.md](overview.md) — System architecture
