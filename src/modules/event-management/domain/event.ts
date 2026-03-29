export type EventStatus = 'scheduled' | 'cancelled';

export interface Event {
  readonly id: string;
  readonly groupId: string | null;
  readonly ownerId: string;
  readonly title: string;
  readonly description: string | null;
  readonly startAt: Date;
  readonly endAt: Date | null;
  readonly createdBy: string;
  readonly status: EventStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateEventData {
  readonly groupId: string | null;
  readonly title: string;
  readonly description?: string | null;
  readonly startAt: Date;
  readonly endAt?: Date | null;
  readonly createdBy: string;
  /** User IDs to invite. For group events, the creator must be included. For personal events (groupId is null), the owner must be included to ensure event-scoped features work. */
  readonly inviteeIds: ReadonlyArray<string>;
}

/** Partial update data for an event. Only provided fields are changed. */
export interface UpdateEventData {
  readonly title?: string;
  readonly description?: string | null;
  readonly startAt?: Date;
  readonly endAt?: Date | null;
}
