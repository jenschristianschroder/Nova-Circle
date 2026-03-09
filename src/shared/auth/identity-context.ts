/** Represents a resolved, trusted caller identity attached to each request. */
export interface IdentityContext {
  /** Unique identifier for the caller (e.g. Azure object ID or test user ID). */
  readonly userId: string;
  /** Human-readable display name used in audit logs. Never trust for authorization. */
  readonly displayName: string;
}
