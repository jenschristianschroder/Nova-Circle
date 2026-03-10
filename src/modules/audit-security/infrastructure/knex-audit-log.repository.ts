import type { Knex } from 'knex';
import type { AuditLogPort } from '../domain/audit-log.port.js';
import type { RecordAuditEntryData } from '../domain/audit-event.js';

export class KnexAuditLogRepository implements AuditLogPort {
  constructor(private readonly db: Knex) {}

  async record(entry: RecordAuditEntryData): Promise<void> {
    try {
      await this.db('audit_log').insert({
        occurred_at: new Date(),
        actor_id: entry.actorId,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId,
        group_id: entry.groupId ?? null,
        metadata: entry.metadata ?? null,
      });
    } catch (error) {
      // Audit logging must be tolerant of transient failures: log and continue.
      // Only safe, non-sensitive fields are included in the log message.
      console.error('Failed to record audit log entry', {
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        groupId: entry.groupId ?? null,
        error,
      });
    }
  }
}
