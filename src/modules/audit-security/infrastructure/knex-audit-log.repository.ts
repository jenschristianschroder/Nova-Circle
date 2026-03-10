import type { Knex } from 'knex';
import type { AuditLogPort, AuditLogEntry } from '../domain/audit-log.js';

export class KnexAuditLogRepository implements AuditLogPort {
  constructor(private readonly db: Knex) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.db('audit_log').insert({
      actor_id: entry.actorId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      metadata: entry.metadata ?? null,
    });
  }
}
