export interface EventChecklist {
  readonly id: string;
  readonly eventId: string;
  readonly createdAt: Date;
}

export interface EventChecklistItem {
  readonly id: string;
  readonly checklistId: string;
  readonly createdByUserId: string;
  readonly text: string;
  readonly isDone: boolean;
  readonly assignedToUserId: string | null;
  readonly dueAt: Date | null;
  readonly displayOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly completedByUserId: string | null;
}

export interface AddChecklistItemData {
  readonly text: string;
  readonly displayOrder?: number;
}

export interface UpdateChecklistItemData {
  readonly text?: string;
  readonly assignedToUserId?: string | null;
  readonly dueAt?: Date | null;
}
