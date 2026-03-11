import type { Knex } from 'knex';
import type { EventLocationRepositoryPort } from '../domain/event-location.repository.port.js';
import type { EventLocation, SetLocationData } from '../domain/event-location.js';

interface EventLocationRow {
  id: string;
  event_id: string;
  location_type: string;
  display_text: string | null;
  street_address: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
  latitude: string | null;
  longitude: string | null;
  virtual_meeting_url: string | null;
  virtual_platform: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  created_by_user_id: string;
  updated_by_user_id: string;
}

function toEventLocation(row: EventLocationRow): EventLocation {
  return {
    id: row.id,
    eventId: row.event_id,
    locationType: row.location_type as EventLocation['locationType'],
    displayText: row.display_text,
    streetAddress: row.street_address,
    addressLine2: row.address_line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    countryCode: row.country_code,
    latitude: row.latitude != null ? parseFloat(row.latitude) : null,
    longitude: row.longitude != null ? parseFloat(row.longitude) : null,
    virtualMeetingUrl: row.virtual_meeting_url,
    virtualPlatform: row.virtual_platform,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
  };
}

export class KnexEventLocationRepository implements EventLocationRepositoryPort {
  constructor(private readonly db: Knex) {}

  async findByEvent(eventId: string): Promise<EventLocation | null> {
    const row = await this.db<EventLocationRow>('event_locations')
      .where({ event_id: eventId })
      .first();
    return row ? toEventLocation(row) : null;
  }

  async upsert(eventId: string, data: SetLocationData, userId: string): Promise<EventLocation> {
    const now = new Date();

    const result = await this.db.raw<{ rows: EventLocationRow[] }>(
      `INSERT INTO event_locations (
        event_id, location_type, display_text, street_address, address_line2,
        city, region, postal_code, country_code, latitude, longitude,
        virtual_meeting_url, virtual_platform, notes,
        created_at, updated_at, created_by_user_id, updated_by_user_id
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
      ON CONFLICT (event_id) DO UPDATE SET
        location_type = EXCLUDED.location_type,
        display_text = EXCLUDED.display_text,
        street_address = EXCLUDED.street_address,
        address_line2 = EXCLUDED.address_line2,
        city = EXCLUDED.city,
        region = EXCLUDED.region,
        postal_code = EXCLUDED.postal_code,
        country_code = EXCLUDED.country_code,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        virtual_meeting_url = EXCLUDED.virtual_meeting_url,
        virtual_platform = EXCLUDED.virtual_platform,
        notes = EXCLUDED.notes,
        updated_at = EXCLUDED.updated_at,
        updated_by_user_id = EXCLUDED.updated_by_user_id
      RETURNING *`,
      [
        eventId,
        data.locationType,
        data.displayText ?? null,
        data.streetAddress ?? null,
        data.addressLine2 ?? null,
        data.city ?? null,
        data.region ?? null,
        data.postalCode ?? null,
        data.countryCode ?? null,
        data.latitude ?? null,
        data.longitude ?? null,
        data.virtualMeetingUrl ?? null,
        data.virtualPlatform ?? null,
        data.notes ?? null,
        now,
        now,
        userId,
        userId,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to upsert event location: database returned no row');
    }
    return toEventLocation(row);
  }

  async delete(eventId: string): Promise<void> {
    await this.db('event_locations').where({ event_id: eventId }).delete();
  }
}
