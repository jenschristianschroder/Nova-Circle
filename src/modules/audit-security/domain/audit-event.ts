/**
 * Audit actions for sensitive operations.
 *
 * Each value is a dot-separated string identifying the operation category and
 * the specific operation.  Add new values here as new sensitive operations are
 * introduced, rather than using free-form strings in call sites.
 */
export type AuditAction =
  | 'event.created'
  | 'event.cancelled'
  | 'event.deleted'
  | 'event.ownership_transferred'
  | 'event_invitation.added'
  | 'event_invitation.removed'
  | 'event_share.created'
  | 'event_share.updated'
  | 'event_share.revoked'
  | 'member.added'
  | 'member.removed'
  | 'group.updated'
  | 'group.deleted';

/**
 * A persisted audit log entry.
 *
 * Privacy rules:
 * - `actorId` is a user ID (UUID), never a display name or email address.
 * - `metadata` must contain only safe, non-sensitive values (e.g. role, status).
 *   It must never include event titles, user names, email addresses, or raw
 *   request payloads.
 */
export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly groupId: string | null;
  readonly metadata: Record<string, unknown> | null;
}

/**
 * Data required to record a new audit entry.
 *
 * `id` and `occurredAt` are assigned by the repository implementation.
 */
export interface RecordAuditEntryData {
  readonly actorId: string;
  readonly action: AuditAction;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly groupId?: string | null;
  /** Safe additional context. Must not contain sensitive user data. */
  readonly metadata?: Record<string, unknown> | null;
}
