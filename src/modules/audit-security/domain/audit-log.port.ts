import type { RecordAuditEntryData } from './audit-event.js';

/**
 * Port for writing entries to the audit log.
 *
 * Production implementations persist entries to the `audit_log` table.
 * In tests, replace with a spy or no-op implementation as appropriate.
 */
export interface AuditLogPort {
  /**
   * Records a single audit entry.
   *
   * Implementations should be tolerant of transient failures (e.g. log and
   * continue) so that an audit log write failure does not cause the primary
   * operation to fail from the caller's perspective.
   */
  record(entry: RecordAuditEntryData): Promise<void>;
}
