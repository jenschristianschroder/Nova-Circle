export type VisibilityLevel = 'busy' | 'title' | 'details';

const VALID_VISIBILITY_LEVELS: ReadonlySet<string> = new Set<string>(['busy', 'title', 'details']);

/** Type guard: returns true when the value is a recognised VisibilityLevel. */
export function isValidVisibilityLevel(value: unknown): value is VisibilityLevel {
  return typeof value === 'string' && VALID_VISIBILITY_LEVELS.has(value);
}

export interface EventShare {
  readonly id: string;
  readonly eventId: string;
  readonly groupId: string;
  readonly visibilityLevel: VisibilityLevel;
  readonly sharedByUserId: string;
  readonly sharedAt: Date;
  readonly updatedAt: Date;
}

export interface ShareEventData {
  readonly eventId: string;
  readonly groupId: string;
  readonly visibilityLevel: VisibilityLevel;
  readonly sharedByUserId: string;
}
