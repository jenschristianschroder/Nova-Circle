import type { UserProfile, CreateUserProfileData, UpdateUserProfileData } from './user-profile.js';

export interface UserProfileRepositoryPort {
  findById(id: string): Promise<UserProfile | null>;
  /** Returns true when a user_profiles row exists for the given id. */
  exists(id: string): Promise<boolean>;
  /** Creates a new profile. Throws if a row with the same id already exists. */
  create(data: CreateUserProfileData): Promise<UserProfile>;
  /** Creates the profile if it does not exist, otherwise overwrites it. */
  upsert(data: CreateUserProfileData): Promise<UserProfile>;
  update(id: string, data: UpdateUserProfileData): Promise<UserProfile | null>;
}
