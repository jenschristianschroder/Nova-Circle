/**
 * Type guard for PostgreSQL foreign key violation errors (SQLSTATE 23503).
 *
 * Use this to detect FK constraint violations thrown by the database driver
 * so the application layer can surface a clear, actionable error instead of
 * a generic 500.
 */
export function isForeignKeyViolation(err: unknown): boolean {
  return (
    err instanceof Error && (err as Error & { code?: string }).code === '23503'
  );
}
