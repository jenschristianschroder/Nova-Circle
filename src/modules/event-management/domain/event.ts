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
  /** User IDs to invite. Creator is always included. Empty for personal events. */
  readonly inviteeIds: ReadonlyArray<string>;
}

/** Partial update data for an event. Only provided fields are changed. */
export interface UpdateEventData {
  readonly title?: string;
  readonly description?: string | null;
  readonly startAt?: Date;
  readonly endAt?: Date | null;
}
