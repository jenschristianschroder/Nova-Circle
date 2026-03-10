const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true when the string is a valid lower- or upper-case UUID v4 format. */
export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}
