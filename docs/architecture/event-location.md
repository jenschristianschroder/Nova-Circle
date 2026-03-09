# Nova-Circle — Event Location

## Module Responsibility

The `event-location` module stores and retrieves location information scoped exclusively to a single event. Location data is visible only to event invitees; no location data is exposed at the group level.

This module supports physical locations (venues, addresses, coordinates), virtual meeting locations (URLs), and hybrid events that include both.

This module does **not**:

- Expose location data at the group level.
- Index or aggregate location data for search outside the event context.
- Validate whether a physical address exists in a mapping service (that is deferred to a future capability).

---

## Scope Constraint

> Location is event-scoped only.

No API endpoint, query, or response schema may expose event location details outside the event detail view. This applies to:

- Group event list responses.
- Group summary or dashboard views.
- Search results.
- Notification payloads (notification may indicate "event location has been updated" without including the location data itself, unless policy explicitly permits inclusion for active invitees).

---

## Privacy Sensitivity

Location data carries elevated privacy sensitivity, especially when the location is a private home, a personal address, or a workplace. The following rules apply:

- Location data is returned only to users with active event access.
- Location data (especially street address and coordinates) is not logged at broad log levels.
- Log entries reference the event ID and operation name; they do not include the address string or coordinates.
- Coordinates are stored with only as much precision as the use case requires.
- Virtual meeting URLs may contain embedded credentials (e.g., Zoom passcodes in URLs); these are treated as sensitive and are not logged.

---

## Domain Model

### EventLocation

One `EventLocation` record per event. Created or updated via explicit API call.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Immutable |
| `eventId` | UUID | References `Event.id`; unique (one location record per event) |
| `locationType` | enum | `physical`, `virtual`, `hybrid` |
| `displayText` | string | Human-friendly location text shown to invitees; max 500 chars; nullable |
| `streetAddress` | string | Structured street address line 1; nullable |
| `addressLine2` | string | Suite, floor, unit; nullable |
| `city` | string | City; nullable |
| `region` | string | State/province/region; nullable |
| `postalCode` | string | Postal/ZIP code; nullable |
| `countryCode` | string | ISO 3166-1 alpha-2 country code; nullable |
| `latitude` | decimal | WGS-84 latitude; nullable |
| `longitude` | decimal | WGS-84 longitude; nullable |
| `virtualMeetingUrl` | string | URL for virtual or hybrid meeting; nullable |
| `virtualPlatform` | string | Platform name (e.g., "Zoom", "Teams"); nullable; informational only |
| `notes` | string | Additional location notes (parking, entry instructions); nullable; max 1000 chars |
| `createdAt` | timestamp | Set on insert |
| `updatedAt` | timestamp | Updated on each change |
| `createdByUserId` | UUID | Who set the location |
| `updatedByUserId` | UUID | Who last updated the location |

### Location Type Rules

| `locationType` | Required fields |
|---|---|
| `physical` | At least `displayText` or `streetAddress` |
| `virtual` | `virtualMeetingUrl` required |
| `hybrid` | At least one physical field AND `virtualMeetingUrl` required |

---

## Authorization

### Access Rule

A user may access the location for an event if and only if:

- The user is the event creator, **or**
- The user has an `EventInvitation` for the event in state `invited`, `accepted`, `declined`, or `tentative`.

This check is performed by the `event-location` module by querying `EventInvitation` records via the `event-management` read interface. Group membership is not used as a proxy for access.

### Operation Authorization

| Operation | Required condition |
|---|---|
| Read location | Active event access |
| Set or update location | Event creator, or group `admin`/`owner` with event access |
| Delete location | Event creator, or group `admin`/`owner` with event access |

A group `admin` who has no `EventInvitation` for the event has no access to the event's location data.

---

## Allowed Operations

### Read Location

Returns the location record for the event. If no location has been set, returns `404 Not Found` (or a structured empty response, per product preference).

Response includes all non-null location fields. Structured fields (street address, coordinates) and `virtualMeetingUrl` are included for authorised callers.

### Set or Update Location

Validates:
- `locationType` is a valid enum value.
- Required fields for the `locationType` are present (see table above).
- `virtualMeetingUrl` is a valid URL when present.
- `countryCode` conforms to ISO 3166-1 alpha-2 when present.
- `latitude` and `longitude` are within valid WGS-84 ranges when present.
- Caller has the required role.

Upserts the `EventLocation` record (create on first set, update on subsequent calls). Sets `updatedAt` and `updatedByUserId`. Publishes `EventLocationUpdated` domain event.

### Delete Location

Validates:
- Caller has the required role.

Deletes the `EventLocation` row. Publishes `EventLocationDeleted` domain event for audit.

---

## Privacy Rules

- Location data is returned only to active event invitees and the event creator.
- Location data, especially `streetAddress`, `latitude`, `longitude`, and `virtualMeetingUrl`, is never logged at broad log levels.
- Location data is never included in group-level event list responses.
- When an invitation is revoked (state set to `removed`), the user can no longer retrieve the event location. No cached copy is served.
- Home addresses and other private locations receive no special tagging in the data model, but implementers must treat all `physical` locations as potentially sensitive.
- Virtual meeting URLs that contain embedded credentials must not be logged or included in notification payloads where those payloads may be stored broadly.

---

## API Surface

All endpoints require authentication. Event access is verified before any data is returned or mutated.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/events/{eventId}/location` | Get the event location |
| `PUT` | `/api/v1/events/{eventId}/location` | Set or update the event location |
| `DELETE` | `/api/v1/events/{eventId}/location` | Remove the event location |

### Error Responses

| Scenario | HTTP status |
|---|---|
| Unauthenticated | `401 Unauthorized` |
| Event not found or caller has no event access | `404 Not Found` |
| Caller authenticated but not authorised for the operation | `403 Forbidden` |
| Validation failure | `400 Bad Request` with structured error body |
| Server error | `500 Internal Server Error` (safe message only) |

Using `404 Not Found` for "event exists but caller has no access" prevents confirming the existence of the event or its location to unauthorised callers.

---

## Domain Events Published

| Domain Event | Trigger | Subscribers |
|---|---|---|
| `EventLocationUpdated` | Location set or updated | `notifications` (if configured), `audit-security` |
| `EventLocationDeleted` | Location removed | `audit-security` |

`audit-security` records a reference to the event and the operation; it does not store the full address in the audit log.

---

## Persistence

- `EventLocation` is stored in the relational database.
- `eventId` has a unique constraint (one location per event).
- Schema changes are applied via migrations run in CI.
- Coordinates are stored as `decimal(9,6)` (precision sufficient for roughly 10 cm, adequate for venue-level location without excessive precision).

---

## Required Tests

### Unit Tests

- Setting a `physical` location without `displayText` or `streetAddress` fails validation.
- Setting a `virtual` location without `virtualMeetingUrl` fails validation.
- Setting a `hybrid` location without at least one physical field fails validation.
- Setting a `hybrid` location without `virtualMeetingUrl` fails validation.
- `latitude` outside the range −90 to 90 fails validation.
- `longitude` outside the range −180 to 180 fails validation.
- `countryCode` that is not a valid ISO 3166-1 alpha-2 code fails validation.
- `virtualMeetingUrl` that is not a valid URL fails validation.

### Authorization Tests

These tests are mandatory.

| Actor | Operation | Expected result |
|---|---|---|
| Event creator | Read location | ✅ Returns location |
| Active invitee | Read location | ✅ Returns location |
| Active invitee | Set location | ❌ `403 Forbidden` (not creator or admin) |
| Event creator | Set location | ✅ Succeeds |
| Group `admin` with event access | Set location | ✅ Succeeds |
| Removed invitee | Read location | ❌ `404 Not Found` |
| Non-invited group member | Read location | ❌ `404 Not Found` |
| New member (joined after event creation) | Read location | ❌ `404 Not Found` |
| Unauthenticated caller | Any operation | ❌ `401 Unauthorized` |
| Caller from different group | Any operation | ❌ `404 Not Found` |

### Integration Tests

- Setting a location for an event for the first time creates an `EventLocation` row.
- Updating an existing location updates the row and sets `updatedAt` and `updatedByUserId`.
- Deleting the location removes the row.
- `EventLocationUpdated` domain event is published after set/update.
- `EventLocationDeleted` domain event is published after delete.

### Privacy Tests

- Group event list API response does not include any location data for any event.
- Location API response does not include any personally identifiable data beyond what is stored in `EventLocation`.
- Log output for a `SetLocationCommand` execution does not contain the street address or coordinates.

---

## Related Documents

- [access-control.md](access-control.md) — Event access model
- [event-management.md](event-management.md) — Event and invitation model
- [testing.md](testing.md) — Test strategy
- [overview.md](overview.md) — System architecture
