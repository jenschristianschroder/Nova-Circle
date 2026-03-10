import type { Knex } from 'knex';
import type { AuditLogPort } from '../domain/audit-log.port.js';
import type { WriteAuditLogData } from '../domain/audit-log.js';

export class KnexAuditLogRepository implements AuditLogPort {
  constructor(private readonly db: Knex) {}

  async write(entry: WriteAuditLogData): Promise<void> {
    await this.db('audit_log').insert({
      action: entry.action,
      actor_id: entry.actorId,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      group_id: entry.groupId ?? null,
      created_at: new Date(),
    });
  }
}
