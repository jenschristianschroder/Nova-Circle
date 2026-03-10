/**
 * AuditSecurity module – public API surface.
 *
 * Re-export only what other modules and the presentation layer are allowed to use.
 * Internal domain, application, and infrastructure details must not be exported here.
 */

export type { AuditLogEntry, AuditLogPort } from './domain/audit-log.js';
