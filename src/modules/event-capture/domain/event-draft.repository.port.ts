import type { EventDraft, CreateDraftData, UpdateDraftCandidates } from './event-draft.js';

export interface EventDraftRepositoryPort {
  create(data: CreateDraftData): Promise<EventDraft>;
  findById(draftId: string): Promise<EventDraft | null>;
  listByUser(userId: string): Promise<EventDraft[]>;
  updateCandidates(draftId: string, data: UpdateDraftCandidates): Promise<EventDraft | null>;
  promote(draftId: string): Promise<EventDraft | null>;
  abandon(draftId: string): Promise<EventDraft | null>;
}
