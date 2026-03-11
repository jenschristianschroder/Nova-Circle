export interface EventChatThread {
  readonly id: string;
  readonly eventId: string;
  readonly createdAt: Date;
}

export interface EventChatMessage {
  readonly id: string;
  readonly threadId: string;
  readonly authorUserId: string;
  readonly content: string;
  readonly postedAt: Date;
  readonly editedAt: Date | null;
  readonly deletedAt: Date | null;
  readonly deletedByUserId: string | null;
}

export interface PostMessageData {
  readonly content: string;
}
