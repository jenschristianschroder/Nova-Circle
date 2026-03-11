import type { SetLocationData, LocationType } from './event-location.js';

const VALID_LOCATION_TYPES: LocationType[] = ['physical', 'virtual', 'hybrid'];

function validationError(message: string): never {
  throw Object.assign(new Error(message), { code: 'VALIDATION_ERROR' });
}

/**
 * Validates a SetLocationData object, throwing a VALIDATION_ERROR-coded error
 * on the first validation failure encountered.
 *
 * Note: explicit runtime type guards are applied to all string/number fields
 * because the router may receive untyped JSON and only applies TypeScript casts.
 */
export function validateSetLocationData(data: SetLocationData): void {
  if (!VALID_LOCATION_TYPES.includes(data.locationType)) {
    validationError(`locationType must be one of: ${VALID_LOCATION_TYPES.join(', ')}`);
  }

  if (data.displayText != null && typeof data.displayText !== 'string') {
    validationError('displayText must be a string');
  }

  if (data.streetAddress != null && typeof data.streetAddress !== 'string') {
    validationError('streetAddress must be a string');
  }

  if (data.addressLine2 != null && typeof data.addressLine2 !== 'string') {
    validationError('addressLine2 must be a string');
  }

  if (data.city != null && typeof data.city !== 'string') {
    validationError('city must be a string');
  }

  if (data.region != null && typeof data.region !== 'string') {
    validationError('region must be a string');
  }

  if (data.postalCode != null && typeof data.postalCode !== 'string') {
    validationError('postalCode must be a string');
  }

  if (data.virtualMeetingUrl != null && typeof data.virtualMeetingUrl !== 'string') {
    validationError('virtualMeetingUrl must be a string');
  }

  if (data.virtualPlatform != null && typeof data.virtualPlatform !== 'string') {
    validationError('virtualPlatform must be a string');
  }

  if (data.countryCode != null && typeof data.countryCode !== 'string') {
    validationError('countryCode must be a string');
  }

  if (data.notes != null && typeof data.notes !== 'string') {
    validationError('notes must be a string');
  }

  if (data.latitude != null && !Number.isFinite(data.latitude)) {
    validationError('latitude must be a finite number');
  }

  if (data.longitude != null && !Number.isFinite(data.longitude)) {
    validationError('longitude must be a finite number');
  }

  const hasPhysicalField =
    (data.displayText != null &&
      typeof data.displayText === 'string' &&
      data.displayText.trim().length > 0) ||
    (data.streetAddress != null &&
      typeof data.streetAddress === 'string' &&
      data.streetAddress.trim().length > 0);

  const hasVirtualUrl =
    data.virtualMeetingUrl != null &&
    typeof data.virtualMeetingUrl === 'string' &&
    data.virtualMeetingUrl.trim().length > 0;

  if (data.locationType === 'physical' && !hasPhysicalField) {
    validationError('A physical location requires at least displayText or streetAddress');
  }

  if (data.locationType === 'virtual' && !hasVirtualUrl) {
    validationError('A virtual location requires virtualMeetingUrl');
  }

  if (data.locationType === 'hybrid') {
    if (!hasVirtualUrl) {
      validationError('A hybrid location requires virtualMeetingUrl');
    }
    if (!hasPhysicalField) {
      validationError('A hybrid location requires at least displayText or streetAddress');
    }
  }

  if (
    data.virtualMeetingUrl != null &&
    typeof data.virtualMeetingUrl === 'string' &&
    data.virtualMeetingUrl.trim().length > 0
  ) {
    try {
      new URL(data.virtualMeetingUrl);
    } catch {
      validationError('virtualMeetingUrl must be a valid URL');
    }
  }

  if (
    data.countryCode != null &&
    typeof data.countryCode === 'string' &&
    data.countryCode.trim().length > 0
  ) {
    // Validates format only (2 uppercase letters); does not verify the code
    // exists in the official ISO 3166-1 alpha-2 list.
    if (!/^[A-Z]{2}$/.test(data.countryCode)) {
      validationError('countryCode must be a valid ISO 3166-1 alpha-2 code (e.g. "US")');
    }
  }

  if (data.latitude != null && Number.isFinite(data.latitude)) {
    if (data.latitude < -90 || data.latitude > 90) {
      validationError('latitude must be between -90 and 90');
    }
  }

  if (data.longitude != null && Number.isFinite(data.longitude)) {
    if (data.longitude < -180 || data.longitude > 180) {
      validationError('longitude must be between -180 and 180');
    }
  }

  if (
    data.displayText != null &&
    typeof data.displayText === 'string' &&
    data.displayText.length > 500
  ) {
    validationError('displayText must not exceed 500 characters');
  }

  if (data.notes != null && typeof data.notes === 'string' && data.notes.length > 1000) {
    validationError('notes must not exceed 1000 characters');
  }
}
