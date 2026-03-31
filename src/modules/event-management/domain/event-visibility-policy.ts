import type { VisibilityLevel } from '../../event-sharing/domain/event-share.js';
import type { EventStatus } from './event.js';

/**
 * Fields that are always visible regardless of visibility level.
 *
 * These are the minimum fields needed for calendar rendering (time-slot
 * blocking) without revealing private event content.
 */
export interface VisibilityBaseFields {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerDisplayName: string;
  readonly startAt: string;
  readonly endAt: string | null;
  readonly visibilityLevel: VisibilityLevel;
}

/**
 * Input record containing all event fields before visibility filtering.
 *
 * This is intentionally decoupled from persistence types so the policy
 * can be tested without infrastructure dependencies.
 *
 * Note: `eventId` maps to `id` in the output (VisibilityFilteredEvent)
 * because input records use the persistence naming convention (`eventId`)
 * while API outputs use the client-facing name (`id`).
 */
export interface VisibilityInput {
  readonly eventId: string;
  readonly ownerId: string;
  readonly ownerDisplayName: string;
  readonly title: string;
  readonly description: string | null;
  readonly startAt: Date;
  readonly endAt: Date | null;
  readonly status: EventStatus;
  readonly visibilityLevel: VisibilityLevel;
}

/**
 * Output record after visibility filtering has been applied.
 *
 * Sensitive fields (`title`, `description`, `status`) are only present
 * when the visibility level permits them.
 */
export interface VisibilityFilteredEvent extends VisibilityBaseFields {
  readonly title?: string;
  readonly description?: string | null;
  readonly status?: EventStatus;
}

/**
 * Domain policy that controls which event fields are exposed to group
 * members based on the share's `visibilityLevel`.
 *
 * ## Visibility Levels
 *
 * | Level     | Exposed fields                                              |
 * |-----------|-------------------------------------------------------------|
 * | `busy`    | id, ownerId, ownerDisplayName, startAt, endAt               |
 * | `title`   | above + title, status                                       |
 * | `details` | above + description                                         |
 *
 * ## Privacy Guarantees
 *
 * - **`busy`** — The most restrictive level. Only the time slot and owner
 *   identity are visible. Title, description, and status are **never**
 *   included, preventing any content leakage.
 *
 * - **`title`** — Exposes the event title and scheduling status so group
 *   members can identify the event. Description remains **hidden**.
 *
 * - **`details`** — Full visibility. Title, description, and status are
 *   all included. The event owner explicitly opted into this level.
 *
 * ## Fail-Closed Behaviour
 *
 * Unrecognised or corrupted visibility levels are coerced to `busy`
 * (the most restrictive level) to prevent accidental data exposure.
 * This ensures that data-at-rest corruption or future level additions
 * never silently widen the exposure surface.
 */
export class EventVisibilityPolicy {
  /**
   * Normalize a raw visibility level value to a known safe level.
   *
   * Returns the value unchanged when it is a recognised level, or `'busy'`
   * (most restrictive) for any unrecognised or corrupted value.
   */
  static sanitizeLevel(raw: string): VisibilityLevel {
    if (raw === 'busy' || raw === 'title' || raw === 'details') {
      return raw;
    }
    return 'busy';
  }

  /**
   * Apply visibility-level filtering to a raw event record.
   *
   * Returns a new object containing **only** the fields permitted by the
   * share's visibility level. Unrecognised levels are fail-closed to `busy`.
   */
  static filterRecord(record: VisibilityInput): VisibilityFilteredEvent {
    const safeLevel = EventVisibilityPolicy.sanitizeLevel(record.visibilityLevel);

    const base: VisibilityFilteredEvent = {
      id: record.eventId,
      ownerId: record.ownerId,
      ownerDisplayName: record.ownerDisplayName,
      startAt: record.startAt.toISOString(),
      endAt: record.endAt ? record.endAt.toISOString() : null,
      visibilityLevel: safeLevel,
    };

    switch (safeLevel) {
      case 'details':
        return {
          ...base,
          title: record.title,
          description: record.description,
          status: record.status,
        };

      case 'title':
        return { ...base, title: record.title, status: record.status };

      case 'busy':
      default:
        return base;
    }
  }
}
