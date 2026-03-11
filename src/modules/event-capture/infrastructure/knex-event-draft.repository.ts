import type { Knex } from 'knex';
import type { EventDraftRepositoryPort } from '../domain/event-draft.repository.port.js';
import type {
  EventDraft,
  CreateDraftData,
  UpdateDraftCandidates,
  DraftIssue,
  RawInputType,
  DraftStatus,
} from '../domain/event-draft.js';

interface EventDraftRow {
  id: string;
  created_by_user_id: string;
  group_id: string | null;
  raw_input_type: string;
  raw_text_content: string | null;
  audio_blob_reference: string | null;
  image_blob_reference: string | null;
  candidate_title: string | null;
  candidate_description: string | null;
  candidate_start_at: Date | null;
  candidate_end_at: Date | null;
  issues: string | DraftIssue[];
  status: string;
  created_at: Date;
  updated_at: Date;
}

function toEventDraft(row: EventDraftRow): EventDraft {
  const issues: DraftIssue[] =
    typeof row.issues === 'string' ? (JSON.parse(row.issues) as DraftIssue[]) : row.issues;

  return {
    id: row.id,
    createdByUserId: row.created_by_user_id,
    groupId: row.group_id,
    rawInputType: row.raw_input_type as RawInputType,
    rawTextContent: row.raw_text_content,
    audioBlobReference: row.audio_blob_reference,
    imageBlobReference: row.image_blob_reference,
    candidateTitle: row.candidate_title,
    candidateDescription: row.candidate_description,
    candidateStartAt: row.candidate_start_at ? new Date(row.candidate_start_at) : null,
    candidateEndAt: row.candidate_end_at ? new Date(row.candidate_end_at) : null,
    issues,
    status: row.status as DraftStatus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class KnexEventDraftRepository implements EventDraftRepositoryPort {
  constructor(private readonly db: Knex) {}

  async create(data: CreateDraftData): Promise<EventDraft> {
    const now = new Date();
    const rows = await this.db<EventDraftRow>('event_drafts')
      .insert({
        created_by_user_id: data.createdByUserId,
        group_id: data.groupId,
        raw_input_type: data.rawInputType,
        raw_text_content: data.rawTextContent,
        audio_blob_reference: data.audioBlobReference,
        image_blob_reference: data.imageBlobReference,
        candidate_title: data.candidateTitle,
        candidate_description: data.candidateDescription,
        candidate_start_at: data.candidateStartAt,
        candidate_end_at: data.candidateEndAt,
        issues: JSON.stringify(data.issues),
        status: 'pending_review',
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    const row = rows[0];
    if (!row)
      throw new Error('Failed to create event draft: database returned no row after insert');
    return toEventDraft(row);
  }

  async findById(draftId: string): Promise<EventDraft | null> {
    const row = await this.db<EventDraftRow>('event_drafts').where({ id: draftId }).first();
    return row ? toEventDraft(row) : null;
  }

  async listByUser(userId: string): Promise<EventDraft[]> {
    const rows = await this.db<EventDraftRow>('event_drafts')
      .where({ created_by_user_id: userId, status: 'pending_review' })
      .orderBy('created_at', 'desc');
    return rows.map(toEventDraft);
  }

  async updateCandidates(draftId: string, data: UpdateDraftCandidates): Promise<EventDraft | null> {
    const updatePayload: Record<string, unknown> = {
      issues: JSON.stringify(data.issues),
      updated_at: new Date(),
    };

    if (data.groupId !== undefined) updatePayload['group_id'] = data.groupId;
    if (data.candidateTitle !== undefined) updatePayload['candidate_title'] = data.candidateTitle;
    if (data.candidateDescription !== undefined)
      updatePayload['candidate_description'] = data.candidateDescription;
    if (data.candidateStartAt !== undefined)
      updatePayload['candidate_start_at'] = data.candidateStartAt;
    if (data.candidateEndAt !== undefined) updatePayload['candidate_end_at'] = data.candidateEndAt;

    const rows = await this.db<EventDraftRow>('event_drafts')
      .where({ id: draftId })
      .update(updatePayload)
      .returning('*');

    const row = rows[0];
    return row ? toEventDraft(row) : null;
  }

  async promote(draftId: string): Promise<EventDraft | null> {
    const rows = await this.db<EventDraftRow>('event_drafts')
      .where({ id: draftId })
      .update({ status: 'promoted', updated_at: new Date() })
      .returning('*');

    const row = rows[0];
    return row ? toEventDraft(row) : null;
  }

  async abandon(draftId: string): Promise<EventDraft | null> {
    const rows = await this.db<EventDraftRow>('event_drafts')
      .where({ id: draftId })
      .update({ status: 'abandoned', updated_at: new Date() })
      .returning('*');

    const row = rows[0];
    return row ? toEventDraft(row) : null;
  }
}
