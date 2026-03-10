import type { WriteAuditLogData } from './audit-log.js';

export interface AuditLogPort {
  write(entry: WriteAuditLogData): Promise<void>;
}
