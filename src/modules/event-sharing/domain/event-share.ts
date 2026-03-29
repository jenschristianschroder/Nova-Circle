export type VisibilityLevel = 'busy' | 'title' | 'details';

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
