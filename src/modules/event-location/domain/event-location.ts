export type LocationType = 'physical' | 'virtual' | 'hybrid';

export interface EventLocation {
  readonly id: string;
  readonly eventId: string;
  readonly locationType: LocationType;
  readonly displayText: string | null;
  readonly streetAddress: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly virtualMeetingUrl: string | null;
  readonly virtualPlatform: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdByUserId: string;
  readonly updatedByUserId: string;
}

export interface SetLocationData {
  readonly locationType: LocationType;
  readonly displayText?: string | null;
  readonly streetAddress?: string | null;
  readonly addressLine2?: string | null;
  readonly city?: string | null;
  readonly region?: string | null;
  readonly postalCode?: string | null;
  readonly countryCode?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly virtualMeetingUrl?: string | null;
  readonly virtualPlatform?: string | null;
  readonly notes?: string | null;
}
