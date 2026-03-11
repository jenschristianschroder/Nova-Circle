import type { Knex } from 'knex';
import type {
  EventChatRepositoryPort,
  ListMessagesOptions,
} from '../domain/event-chat.repository.port.js';
import type { EventChatThread, EventChatMessage } from '../domain/event-chat.js';

interface ThreadRow {
  id: string;
  event_id: string;
  created_at: Date;
}

interface MessageRow {
  id: string;
  thread_id: string;
  author_user_id: string;
  content: string;
  posted_at: Date;
  edited_at: Date | null;
  deleted_at: Date | null;
  deleted_by_user_id: string | null;
}

function toThread(row: ThreadRow): EventChatThread {
  return {
    id: row.id,
    eventId: row.event_id,
    createdAt: new Date(row.created_at),
  };
}

function toMessage(row: MessageRow): EventChatMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorUserId: row.author_user_id,
    content: row.content,
    postedAt: new Date(row.posted_at),
    editedAt: row.edited_at ? new Date(row.edited_at) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    deletedByUserId: row.deleted_by_user_id,
  };
}

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_MESSAGE_LIMIT = 100;

export class KnexEventChatRepository implements EventChatRepositoryPort {
  constructor(private readonly db: Knex) {}

  async findOrCreateThread(eventId: string): Promise<EventChatThread> {
    const existing = await this.db<ThreadRow>('event_chat_threads')
      .where({ event_id: eventId })
      .first();
    if (existing) return toThread(existing);

    const result = await this.db.raw<{ rows: ThreadRow[] }>(
      `INSERT INTO event_chat_threads (event_id)
       VALUES (?)
       ON CONFLICT (event_id) DO UPDATE SET event_id = EXCLUDED.event_id
       RETURNING *`,
      [eventId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create chat thread');
    return toThread(row);
  }

  async findThreadByEvent(eventId: string): Promise<EventChatThread | null> {
    const row = await this.db<ThreadRow>('event_chat_threads').where({ event_id: eventId }).first();
    return row ? toThread(row) : null;
  }

  async listMessages(threadId: string, options?: ListMessagesOptions): Promise<EventChatMessage[]> {
    const limit = Math.min(options?.limit ?? DEFAULT_MESSAGE_LIMIT, MAX_MESSAGE_LIMIT);

    let query = this.db<MessageRow>('event_chat_messages')
      .where({ thread_id: threadId })
      .whereNull('deleted_at')
      .orderBy('posted_at', 'asc')
      .limit(limit);

    if (options?.before) {
      const before = new Date(options.before);
      if (isNaN(before.getTime())) {
        throw Object.assign(new Error('Invalid "before" cursor: must be a valid ISO timestamp'), {
          code: 'VALIDATION_ERROR',
        });
      }
      query = query.where('posted_at', '<', before);
    }

    if (options?.after) {
      const after = new Date(options.after);
      if (isNaN(after.getTime())) {
        throw Object.assign(new Error('Invalid "after" cursor: must be a valid ISO timestamp'), {
          code: 'VALIDATION_ERROR',
        });
      }
      query = query.where('posted_at', '>', after);
    }

    const rows = await query;
    return rows.map(toMessage);
  }

  async postMessage(
    threadId: string,
    content: string,
    authorUserId: string,
  ): Promise<EventChatMessage> {
    const now = new Date();
    const rows = await this.db<MessageRow>('event_chat_messages')
      .insert({
        thread_id: threadId,
        author_user_id: authorUserId,
        content,
        posted_at: now,
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to post message');
    return toMessage(row);
  }

  async findMessage(messageId: string): Promise<EventChatMessage | null> {
    const row = await this.db<MessageRow>('event_chat_messages').where({ id: messageId }).first();
    return row ? toMessage(row) : null;
  }

  async editMessage(messageId: string, content: string): Promise<EventChatMessage | null> {
    const rows = await this.db<MessageRow>('event_chat_messages')
      .where({ id: messageId })
      .update({ content, edited_at: new Date() })
      .returning('*');

    const row = rows[0];
    return row ? toMessage(row) : null;
  }

  async softDeleteMessage(
    messageId: string,
    deletedByUserId: string,
  ): Promise<EventChatMessage | null> {
    const rows = await this.db<MessageRow>('event_chat_messages')
      .where({ id: messageId })
      .update({ deleted_at: new Date(), deleted_by_user_id: deletedByUserId })
      .returning('*');

    const row = rows[0];
    return row ? toMessage(row) : null;
  }
}
