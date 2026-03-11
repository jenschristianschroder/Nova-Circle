import type {
  EventChecklist,
  EventChecklistItem,
  AddChecklistItemData,
  UpdateChecklistItemData,
} from './event-checklist.js';

export interface EventChecklistRepositoryPort {
  findOrCreateChecklist(eventId: string): Promise<EventChecklist>;
  findChecklistByEvent(eventId: string): Promise<EventChecklist | null>;
  listItems(checklistId: string): Promise<EventChecklistItem[]>;
  addItem(
    checklistId: string,
    data: AddChecklistItemData,
    userId: string,
  ): Promise<EventChecklistItem>;
  findItem(itemId: string): Promise<EventChecklistItem | null>;
  updateItem(itemId: string, data: UpdateChecklistItemData): Promise<EventChecklistItem | null>;
  markDone(itemId: string, userId: string): Promise<EventChecklistItem | null>;
  markUndone(itemId: string): Promise<EventChecklistItem | null>;
  deleteItem(itemId: string): Promise<void>;
  reorderItems(checklistId: string, orderedItemIds: string[]): Promise<void>;
}
