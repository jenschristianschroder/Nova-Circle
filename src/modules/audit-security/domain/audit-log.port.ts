export interface AuditLogEntry {
  readonly action: string;
  readonly actorId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly groupId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuditLogPort {
  log(entry: AuditLogEntry): Promise<void>;
}
