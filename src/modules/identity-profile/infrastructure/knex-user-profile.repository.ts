import type { Knex } from 'knex';
import type { UserProfileRepositoryPort } from '../domain/user-profile.repository.port.js';
import type {
  UserProfile,
  CreateUserProfileData,
  UpdateUserProfileData,
} from '../domain/user-profile.js';

interface UserProfileRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: Date;
  updated_at: Date;
}

function toUserProfile(row: UserProfileRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class KnexUserProfileRepository implements UserProfileRepositoryPort {
  constructor(private readonly db: Knex) {}

  async findById(id: string): Promise<UserProfile | null> {
    const row = await this.db<UserProfileRow>('user_profiles').where({ id }).first();
    return row ? toUserProfile(row) : null;
  }

  async exists(id: string): Promise<boolean> {
    const row = await this.db<UserProfileRow>('user_profiles')
      .where({ id })
      .select(this.db.raw('1'))
      .first();
    return row !== undefined;
  }

  async create(data: CreateUserProfileData): Promise<UserProfile> {
    const now = new Date();
    const rows = await this.db<UserProfileRow>('user_profiles')
      .insert({
        id: data.userId,
        display_name: data.displayName,
        avatar_url: data.avatarUrl ?? null,
        created_at: now,
        updated_at: now,
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Insert returned no row');
    return toUserProfile(row);
  }

  /**
   * Inserts a minimal user_profiles row if none exists for the given userId.
   * Uses INSERT … ON CONFLICT DO NOTHING so this is a cheap no-op when the
   * profile already exists (no SELECT needed).
   *
   * Returns `true` when a new row was actually inserted.
   */
  async ensureExists(data: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
  }): Promise<boolean> {
    const now = new Date();
    const result: { rowCount?: number } = await this.db.raw(
      `INSERT INTO user_profiles (id, display_name, avatar_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      [data.userId, data.displayName, data.avatarUrl, now, now],
    );
    // pg returns rowCount; if 0 the row already existed.
    return (result.rowCount ?? 0) > 0;
  }

  async upsert(data: CreateUserProfileData): Promise<UserProfile> {
    const now = new Date();
    const rows = await this.db<UserProfileRow>('user_profiles')
      .insert({
        id: data.userId,
        display_name: data.displayName,
        avatar_url: data.avatarUrl ?? null,
        created_at: now,
        updated_at: now,
      })
      .onConflict('id')
      .merge({
        display_name: data.displayName,
        avatar_url: data.avatarUrl ?? null,
        updated_at: now,
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Upsert returned no row');
    return toUserProfile(row);
  }

  async update(id: string, data: UpdateUserProfileData): Promise<UserProfile | null> {
    const changes: Partial<Omit<UserProfileRow, 'id' | 'created_at'>> = {
      updated_at: new Date(),
    };
    if (data.displayName !== undefined) changes.display_name = data.displayName;
    if (data.avatarUrl !== undefined) changes.avatar_url = data.avatarUrl;

    const rows = await this.db<UserProfileRow>('user_profiles')
      .where({ id })
      .update(changes)
      .returning('*');

    const row = rows[0];
    return row ? toUserProfile(row) : null;
  }
}
