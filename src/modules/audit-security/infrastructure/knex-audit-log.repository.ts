import type { Knex } from 'knex';
import type { AuditLogPort, AuditLogEntry } from '../domain/audit-log.port.js';

interface AuditLogInsertRow {
  action: string;
  actor_id: string;
  resource_type: string;
  resource_id: string;
  group_id: string | null;
  metadata: unknown;
}

export class KnexAuditLogRepository implements AuditLogPort {
  constructor(private readonly db: Knex) {}

  async log(entry: AuditLogEntry): Promise<void> {
    const row: AuditLogInsertRow = {
      action: entry.action,
      actor_id: entry.actorId,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      group_id: entry.groupId ?? null,
      metadata: entry.metadata ?? null,
    };
    await this.db('audit_log').insert(row);
  }
}
