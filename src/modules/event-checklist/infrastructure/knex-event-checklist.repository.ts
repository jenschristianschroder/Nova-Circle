import type { Knex } from 'knex';
import type { EventChecklistRepositoryPort } from '../domain/event-checklist.repository.port.js';
import type {
  EventChecklist,
  EventChecklistItem,
  AddChecklistItemData,
  UpdateChecklistItemData,
} from '../domain/event-checklist.js';

interface ChecklistRow {
  id: string;
  event_id: string;
  created_at: Date;
}

interface ChecklistItemRow {
  id: string;
  checklist_id: string;
  created_by_user_id: string;
  text: string;
  is_done: boolean;
  assigned_to_user_id: string | null;
  due_at: Date | null;
  display_order: number;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  completed_by_user_id: string | null;
}

function toChecklist(row: ChecklistRow): EventChecklist {
  return {
    id: row.id,
    eventId: row.event_id,
    createdAt: new Date(row.created_at),
  };
}

function toItem(row: ChecklistItemRow): EventChecklistItem {
  return {
    id: row.id,
    checklistId: row.checklist_id,
    createdByUserId: row.created_by_user_id,
    text: row.text,
    isDone: row.is_done,
    assignedToUserId: row.assigned_to_user_id,
    dueAt: row.due_at ? new Date(row.due_at) : null,
    displayOrder: row.display_order,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    completedByUserId: row.completed_by_user_id,
  };
}

export class KnexEventChecklistRepository implements EventChecklistRepositoryPort {
  constructor(private readonly db: Knex) {}

  async findOrCreateChecklist(eventId: string): Promise<EventChecklist> {
    const existing = await this.db<ChecklistRow>('event_checklists')
      .where({ event_id: eventId })
      .first();
    if (existing) return toChecklist(existing);

    const result = await this.db.raw<{ rows: ChecklistRow[] }>(
      `INSERT INTO event_checklists (event_id)
       VALUES (?)
       ON CONFLICT (event_id) DO UPDATE SET event_id = EXCLUDED.event_id
       RETURNING *`,
      [eventId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Failed to create checklist');
    return toChecklist(row);
  }

  async findChecklistByEvent(eventId: string): Promise<EventChecklist | null> {
    const row = await this.db<ChecklistRow>('event_checklists')
      .where({ event_id: eventId })
      .first();
    return row ? toChecklist(row) : null;
  }

  async listItems(checklistId: string): Promise<EventChecklistItem[]> {
    const rows = await this.db<ChecklistItemRow>('event_checklist_items')
      .where({ checklist_id: checklistId })
      .orderBy('display_order', 'asc');
    return rows.map(toItem);
  }

  async addItem(
    checklistId: string,
    data: AddChecklistItemData,
    userId: string,
  ): Promise<EventChecklistItem> {
    const now = new Date();

    let order = data.displayOrder;
    if (order === undefined) {
      const maxRow = await this.db<ChecklistItemRow>('event_checklist_items')
        .where({ checklist_id: checklistId })
        .max('display_order as max_order')
        .first();
      const max = (maxRow as { max_order: number | null } | undefined)?.max_order;
      order = max != null ? max + 1 : 0;
    }

    const rows = await this.db<ChecklistItemRow>('event_checklist_items')
      .insert({
        checklist_id: checklistId,
        created_by_user_id: userId,
        text: data.text,
        is_done: false,
        display_order: order,
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to add checklist item');
    return toItem(row);
  }

  async findItem(itemId: string): Promise<EventChecklistItem | null> {
    const row = await this.db<ChecklistItemRow>('event_checklist_items')
      .where({ id: itemId })
      .first();
    return row ? toItem(row) : null;
  }

  async updateItem(
    itemId: string,
    data: UpdateChecklistItemData,
  ): Promise<EventChecklistItem | null> {
    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (data.text !== undefined) patch['text'] = data.text;
    if ('assignedToUserId' in data) patch['assigned_to_user_id'] = data.assignedToUserId ?? null;
    if ('dueAt' in data) patch['due_at'] = data.dueAt ?? null;

    const rows = await this.db<ChecklistItemRow>('event_checklist_items')
      .where({ id: itemId })
      .update(patch)
      .returning('*');

    const row = rows[0];
    return row ? toItem(row) : null;
  }

  async markDone(itemId: string, userId: string): Promise<EventChecklistItem | null> {
    const now = new Date();
    const rows = await this.db<ChecklistItemRow>('event_checklist_items')
      .where({ id: itemId })
      .update({
        is_done: true,
        completed_at: now,
        completed_by_user_id: userId,
        updated_at: now,
      })
      .returning('*');

    const row = rows[0];
    return row ? toItem(row) : null;
  }

  async markUndone(itemId: string): Promise<EventChecklistItem | null> {
    const now = new Date();
    const rows = await this.db<ChecklistItemRow>('event_checklist_items')
      .where({ id: itemId })
      .update({
        is_done: false,
        completed_at: null,
        completed_by_user_id: null,
        updated_at: now,
      })
      .returning('*');

    const row = rows[0];
    return row ? toItem(row) : null;
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.db('event_checklist_items').where({ id: itemId }).delete();
  }

  async reorderItems(checklistId: string, orderedItemIds: string[]): Promise<void> {
    await this.db.transaction(async (trx) => {
      for (let i = 0; i < orderedItemIds.length; i++) {
        await trx('event_checklist_items')
          .where({ id: orderedItemIds[i], checklist_id: checklistId })
          .update({ display_order: i, updated_at: new Date() });
      }
    });
  }
}
