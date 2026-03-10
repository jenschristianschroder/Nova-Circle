export type InvitationStatus = 'invited' | 'accepted' | 'declined' | 'tentative' | 'removed';

export interface EventInvitation {
  readonly id: string;
  readonly eventId: string;
  readonly userId: string;
  readonly status: InvitationStatus;
  readonly invitedAt: Date;
  readonly respondedAt: Date | null;
}
