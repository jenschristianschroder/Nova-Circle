export interface AuditLogEntry {
  readonly actorId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuditLogPort {
  log(entry: AuditLogEntry): Promise<void>;
}
