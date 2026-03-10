export interface Group {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly ownerId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateGroupData {
  readonly name: string;
  readonly description?: string | null;
  readonly ownerId: string;
}

export interface UpdateGroupData {
  readonly name?: string;
  readonly description?: string | null;
}
