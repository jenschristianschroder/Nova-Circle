/**
 * AuditSecurity module – public API surface.
 *
 * Re-export only what other modules and the presentation layer are allowed to use.
 * Internal domain, application, and infrastructure details must not be exported here.
 * The composition root (src/app.ts) imports KnexAuditLogRepository directly from
 * its infrastructure path and does not use this index.
 */

export type { AuditAction, AuditEvent, RecordAuditEntryData } from './domain/audit-event.js';
export type { AuditLogPort } from './domain/audit-log.port.js';
