export interface UserProfile {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateUserProfileData {
  /** Used as the profile's primary key – equals the caller's identity userId. */
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl?: string | null;
}

export interface UpdateUserProfileData {
  readonly displayName?: string;
  readonly avatarUrl?: string | null;
}
