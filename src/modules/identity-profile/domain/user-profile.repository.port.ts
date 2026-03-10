import type { UserProfile, CreateUserProfileData, UpdateUserProfileData } from './user-profile.js';

export interface UserProfileRepositoryPort {
  findById(id: string): Promise<UserProfile | null>;
  /** Creates the profile if it does not exist, otherwise overwrites it. */
  upsert(data: CreateUserProfileData): Promise<UserProfile>;
  update(id: string, data: UpdateUserProfileData): Promise<UserProfile | null>;
}
