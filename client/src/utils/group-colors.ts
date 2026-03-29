/**
 * Group colour assignment utility.
 *
 * Maps group IDs to a deterministic colour slot from the predefined
 * palette (semantic design tokens `--nc-group-color-0` … `--nc-group-color-7`).
 * Personal events use `--nc-group-color-personal`.
 *
 * The assignment is stable for a given ordered list of groupIds: the group
 * at index `i` is assigned to slot `i % GROUP_COLOR_SLOT_COUNT`. When a user
 * has more groups than palette slots, colours cycle deterministically.
 */

/** Number of group colour slots defined in the token system. */
export const GROUP_COLOR_SLOT_COUNT = 8;

/** CSS variable name for a given slot index. */
export function groupColorVar(slotIndex: number): string {
  return `--nc-group-color-${slotIndex % GROUP_COLOR_SLOT_COUNT}`;
}

/** CSS variable name for personal events. */
export const PERSONAL_COLOR_VAR = '--nc-group-color-personal';

/**
 * Build a stable mapping from group ID → slot index.
 *
 * Groups are assigned slots in the order they appear in the array.
 * The result is a Map<groupId, slotIndex>.
 */
export function buildGroupColorMap(groupIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < groupIds.length; i++) {
    map.set(groupIds[i], i % GROUP_COLOR_SLOT_COUNT);
  }
  return map;
}
