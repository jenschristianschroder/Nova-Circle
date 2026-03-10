export type AuditAction = 'event.cancelled';

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actorId: string;
  resourceType: string;
  resourceId: string;
  groupId: string | null;
  createdAt: Date;
}

export interface WriteAuditLogData {
  action: AuditAction;
  actorId: string;
  resourceType: string;
  resourceId: string;
  groupId?: string | null;
}
