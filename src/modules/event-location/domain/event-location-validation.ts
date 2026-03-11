import type { SetLocationData, LocationType } from './event-location.js';

const VALID_LOCATION_TYPES: LocationType[] = ['physical', 'virtual', 'hybrid'];

function validationError(message: string): never {
  throw Object.assign(new Error(message), { code: 'VALIDATION_ERROR' });
}

/**
 * Validates a SetLocationData object, throwing a VALIDATION_ERROR-coded error
 * on the first validation failure encountered.
 */
export function validateSetLocationData(data: SetLocationData): void {
  if (!VALID_LOCATION_TYPES.includes(data.locationType)) {
    validationError(
      `locationType must be one of: ${VALID_LOCATION_TYPES.join(', ')}`,
    );
  }

  const hasPhysicalField =
    (data.displayText != null && data.displayText.trim().length > 0) ||
    (data.streetAddress != null && data.streetAddress.trim().length > 0);

  const hasVirtualUrl =
    data.virtualMeetingUrl != null && data.virtualMeetingUrl.trim().length > 0;

  if (data.locationType === 'physical' && !hasPhysicalField) {
    validationError(
      'A physical location requires at least displayText or streetAddress',
    );
  }

  if (data.locationType === 'virtual' && !hasVirtualUrl) {
    validationError('A virtual location requires virtualMeetingUrl');
  }

  if (data.locationType === 'hybrid') {
    if (!hasVirtualUrl) {
      validationError('A hybrid location requires virtualMeetingUrl');
    }
    if (!hasPhysicalField) {
      validationError(
        'A hybrid location requires at least displayText or streetAddress',
      );
    }
  }

  if (data.virtualMeetingUrl != null && data.virtualMeetingUrl.trim().length > 0) {
    try {
      new URL(data.virtualMeetingUrl);
    } catch {
      validationError('virtualMeetingUrl must be a valid URL');
    }
  }

  if (data.countryCode != null && data.countryCode.trim().length > 0) {
    // Validates format only (2 uppercase letters); does not verify the code
    // exists in the official ISO 3166-1 alpha-2 list.
    if (!/^[A-Z]{2}$/.test(data.countryCode)) {
      validationError('countryCode must be a valid ISO 3166-1 alpha-2 code (e.g. "US")');
    }
  }

  if (data.latitude != null) {
    if (data.latitude < -90 || data.latitude > 90) {
      validationError('latitude must be between -90 and 90');
    }
  }

  if (data.longitude != null) {
    if (data.longitude < -180 || data.longitude > 180) {
      validationError('longitude must be between -180 and 180');
    }
  }

  if (data.displayText != null && data.displayText.length > 500) {
    validationError('displayText must not exceed 500 characters');
  }

  if (data.notes != null && data.notes.length > 1000) {
    validationError('notes must not exceed 1000 characters');
  }
}
