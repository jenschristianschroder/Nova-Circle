export type RawInputType = 'text' | 'voice' | 'image';

export type DraftStatus = 'pending_review' | 'promoted' | 'abandoned';

export type DraftIssueCode =
  | 'missing_title'
  | 'title_too_long'
  | 'missing_start_date'
  | 'missing_start_time'
  | 'ambiguous_date'
  | 'ambiguous_time'
  | 'invalid_time_range'
  | 'missing_group'
  | 'unauthorized_group_access'
  | 'low_confidence_extraction';

export interface DraftIssue {
  readonly code: DraftIssueCode;
  readonly field?: string;
  readonly message: string;
}

export interface EventDraft {
  readonly id: string;
  readonly createdByUserId: string;
  readonly groupId: string | null;
  readonly rawInputType: RawInputType;
  readonly rawTextContent: string | null;
  readonly audioBlobReference: string | null;
  readonly imageBlobReference: string | null;
  readonly candidateTitle: string | null;
  readonly candidateDescription: string | null;
  readonly candidateStartAt: Date | null;
  readonly candidateEndAt: Date | null;
  readonly issues: DraftIssue[];
  readonly status: DraftStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateDraftData {
  readonly createdByUserId: string;
  readonly groupId: string | null;
  readonly rawInputType: RawInputType;
  readonly rawTextContent: string | null;
  readonly audioBlobReference: string | null;
  readonly imageBlobReference: string | null;
  readonly candidateTitle: string | null;
  readonly candidateDescription: string | null;
  readonly candidateStartAt: Date | null;
  readonly candidateEndAt: Date | null;
  readonly issues: DraftIssue[];
}

export interface UpdateDraftCandidates {
  readonly groupId?: string | null;
  readonly candidateTitle?: string | null;
  readonly candidateDescription?: string | null;
  readonly candidateStartAt?: Date | null;
  readonly candidateEndAt?: Date | null;
  readonly issues: DraftIssue[];
}
