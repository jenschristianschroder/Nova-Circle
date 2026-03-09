# Nova-Circle — Access Control

## Foundational Rule

> **Group membership alone never grants event access.**

This is the single most important security invariant in the system. It must be enforced at every layer: domain logic, application services, repository queries, and API responses.

---

## Identity and Role Model

### User Identity

Every authenticated user has a unique `UserId` validated from a Microsoft Entra ID / External ID / B2C token. No application code trusts an identity that has not been validated by the edge middleware.

### Group Roles

A `GroupMember` record ties a `UserId` to a `GroupId` with one of the following roles:

| Role | Capabilities |
|---|---|
| `owner` | Full group administration: rename group, change settings, promote/demote admins, remove members, delete group |
| `admin` | Manage members: add, remove, change roles up to `admin`; manage events in the group |
| `member` | View permitted event list, respond to event invitations, create events |

Group role escalation (promoting a member to `admin`, or an `admin` to `owner`) is an audited operation.

### Event Invitation States

An `EventInvitation` record ties a `UserId` to an `EventId` with one of the following states:

| State | Meaning |
|---|---|
| `invited` | User has been explicitly invited; has not responded |
| `accepted` | User has accepted |
| `declined` | User has declined |
| `tentative` | User has responded tentatively |
| `removed` | Invitation was revoked; user no longer has access |

Only states `invited`, `accepted`, `declined`, and `tentative` grant event access. State `removed` revokes access permanently.

---

## Event Visibility Model

### Who Can See an Event

A user can view an event if and only if **at least one** of the following conditions is true:

1. The user created the event (`Event.createdByUserId == requestingUserId`).
2. The user has an `EventInvitation` for the event in state `invited`, `accepted`, `declined`, or `tentative`.
3. An explicit elevated override policy exists and the user satisfies it (e.g., a future group-admin visibility override, if such a policy is deliberately added).

**There is no implicit group-membership pathway to event access.** A user who is a group member but has no `EventInvitation` for an event cannot see that event.

### Who Cannot See an Event

The following users must not see an event:

| Actor | Reason |
|---|---|
| Current group member with no invitation | No explicit invitation record |
| New member who joined after event creation | Membership snapshot does not include them |
| Removed invitee (state `removed`) | Invitation has been revoked |
| Former group member | Membership ended; access is governed by invitation state, not prior membership |

### Hidden Event Non-Disclosure

Inaccessible events must not be disclosed in any form. The following leakage vectors are all prohibited:

- Returning a count that includes inaccessible events.
- Including inaccessible event titles, descriptions, or IDs in any response.
- Including inaccessible event locations, times, or attendee counts.
- Returning hints such as "and 3 more events" that imply the existence of hidden events.
- Returning chat previews, checklist summaries, or location details for inaccessible events.

All list endpoints that return events must filter to only events the requesting user is explicitly authorised to see, before applying pagination or any other transformation.

---

## Invitation Seeding (Creation-Time Snapshot)

When a user creates an event in a group:

1. The system queries **all current `GroupMember` records** for that group at the moment of creation.
2. These members are pre-populated as the default invite list.
3. The creator may remove any members from the list before saving.
4. When the event is saved, explicit `EventInvitation` rows are written transactionally with the `Event` row.

After save, the invite list is fixed. It is not derived from live group membership. Subsequent group membership changes do not affect the invitation list of an existing event.

### Effect of New Group Members

When a new user joins a group after an event has been created:

- They receive **no** `EventInvitation` for the existing event automatically.
- They do not see the event in group event lists.
- An `admin` or `owner` may explicitly invite them to an existing event if product policy allows, which creates a new `EventInvitation` row.

### Effect of Removing a Member from a Group

When a group `admin` or `owner` removes a member:

- Their `GroupMember` record is deleted or marked inactive.
- Their existing `EventInvitation` records are **not** automatically removed.
- Product policy must be applied explicitly: if the policy is "removed group members lose event access", the application must transition their invitation state to `removed` at removal time.
- Do not leave access ambiguous.

### Effect of a Member Leaving a Group

Same rules as removal apply. A member who voluntarily leaves a group has their `GroupMember` record updated. Existing `EventInvitation` records must be handled according to the product's access policy, applied explicitly.

---

## Group-Level Event List Policy

Group-level event list queries must apply the following filter before returning results:

```
WHERE event.groupId = :groupId
  AND (
    event.createdByUserId = :userId
    OR EXISTS (
      SELECT 1 FROM EventInvitation ei
      WHERE ei.eventId = event.id
        AND ei.userId = :userId
        AND ei.state IN ('invited', 'accepted', 'declined', 'tentative')
    )
  )
```

This filter must be applied at the persistence layer (repository), not only in the presentation layer.

---

## Collaboration Module Access Inheritance

Event-scoped collaboration features inherit event-level access. If a user cannot view an event, they cannot view any of:

- Event chat threads and messages.
- Event checklist and checklist items.
- Event location.
- Event description.
- Event attachments.
- Event source capture artifacts.
- The event's full invite list (subject to per-feature policy).

Authorization checks for collaboration features must re-verify event access; they must not assume event access based on group membership alone.

---

## Group Administration Authorization

### Group Creation

Any authenticated user can create a group. The creator becomes the initial `owner`.

### Group Modification

| Operation | Required role |
|---|---|
| Rename group, change settings | `owner` or `admin` |
| Add member | `owner` or `admin` |
| Remove member | `owner` or `admin` |
| Promote member to `admin` | `owner` |
| Promote `admin` to `owner` | `owner` |
| Demote `admin` to `member` | `owner` |
| Delete group | `owner` |

Attempting a privileged operation without the required role must return `403 Forbidden` with a safe, structured error response. The error must not disclose the existence of other members' data.

---

## Event Administration Authorization

| Operation | Required role |
|---|---|
| Create event | Any group `member`, `admin`, or `owner` |
| View event | Creator or active invitee (see visibility model above) |
| Update event details | Creator, or group `admin`/`owner` if policy allows |
| Cancel event | Creator, or group `admin`/`owner` |
| Manage invitations | Creator, or group `admin`/`owner` |
| Delete event | Creator, or group `owner` |

---

## Policy Examples

### Example 1: New Member Cannot See Historic Event

**Setup:**
- Group "Weekend Runners" has members Alice, Bob, Carol.
- Alice creates event "Saturday 5K". Bob and Carol are invited.
- David joins the group later.

**Expected result:**
- David has no `EventInvitation` for "Saturday 5K".
- David's group event list query returns zero results for "Saturday 5K".
- No count, title, or hint of the event appears in David's responses.

### Example 2: Removed Invitee Loses Access

**Setup:**
- Event "Book Club" has invitations for Alice, Bob, Carol (all `accepted`).
- Carol is removed from the group. Policy: remove group membership → revoke event invitations.

**Expected result:**
- Carol's `EventInvitation` for "Book Club" is transitioned to `removed`.
- Carol can no longer access the event, its chat, checklist, or location.
- Carol's requests to these endpoints return `403 Forbidden` or `404 Not Found` (whichever is policy-appropriate for non-disclosure).

### Example 3: Non-Invited Member Cannot See Event

**Setup:**
- Group "Family" has members Alice, Bob, Carol, David.
- Alice creates event "Surprise Party for Bob". She removes Bob from the default invite list before saving.

**Expected result:**
- Bob has no `EventInvitation` for "Surprise Party for Bob".
- Bob's group event list returns no entry for this event.
- Bob cannot access the event by direct URL or ID.

---

## Authorization Test Matrix

The following test cases are **mandatory** for every protected capability.

| Actor | Expected result |
|---|---|
| Event creator | ✅ Full access |
| Active invitee (`invited`, `accepted`, `tentative`, `declined`) | ✅ Access |
| Removed invitee (`removed` state) | ❌ No access |
| Current group member with no invitation | ❌ No access |
| New group member (joined after event creation) | ❌ No access |
| Former group member (left or removed from group) | ❌ No access (subject to invitation state) |
| Group `admin` or `owner` (no explicit invitation) | ❌ No access unless policy grants explicit override |
| Unauthenticated caller | ❌ `401 Unauthorized` |
| Authenticated user from different group | ❌ `403 Forbidden` or `404 Not Found` |

All of these test cases must be implemented as automated tests that run in CI. See [testing.md](testing.md) for test implementation guidance.

---

## Related Documents

- [overview.md](overview.md) — System architecture and module boundaries
- [event-management.md](event-management.md) — Event lifecycle and invitation seeding detail
- [testing.md](testing.md) — Authorization test strategy and test matrix implementation
