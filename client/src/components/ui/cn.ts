/**
 * Utility for composing CSS class names.
 * Filters out falsy values and joins with a space.
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
