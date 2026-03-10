import type { Knex } from 'knex';
import type { AuditLogPort } from '../domain/audit-log.port.js';
import type { RecordAuditEntryData } from '../domain/audit-event.js';

export class KnexAuditLogRepository implements AuditLogPort {
  constructor(private readonly db: Knex) {}

  async record(entry: RecordAuditEntryData): Promise<void> {
    await this.db('audit_log').insert({
      occurred_at: new Date(),
      actor_id: entry.actorId,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      group_id: entry.groupId ?? null,
      metadata: entry.metadata ?? null,
    });
  }
}
