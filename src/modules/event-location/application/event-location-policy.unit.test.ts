import { describe, it, expect, vi } from 'vitest';
import { validateSetLocationData } from '../domain/event-location-validation.js';
import { GetEventLocationUseCase } from './get-event-location.usecase.js';
import { SetEventLocationUseCase } from './set-event-location.usecase.js';
import type { EventRepositoryPort } from '../../event-management/domain/event.repository.port.js';
import type { EventInvitationRepositoryPort } from '../../event-management/domain/event-invitation.repository.port.js';
import type { EventLocationRepositoryPort } from '../domain/event-location.repository.port.js';
import type { GroupMemberRepositoryPort } from '../../group-membership/domain/group-member.repository.port.js';
import type { Event } from '../../event-management/domain/event.js';
import type { EventLocation } from '../domain/event-location.js';
import { FakeIdentity } from '../../../shared/test-helpers/fake-identity.js';

function makeEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'event-1',
    groupId: 'group-1',
    ownerId: 'creator-id',
    title: 'Test Event',
    description: null,
    startAt: new Date('2026-06-01T12:00:00Z'),
    endAt: null,
    createdBy: 'creator-id',
    status: 'scheduled',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLocation(overrides?: Partial<EventLocation>): EventLocation {
  return {
    id: 'loc-1',
    eventId: 'event-1',
    locationType: 'physical',
    displayText: 'Main Hall',
    streetAddress: null,
    addressLine2: null,
    city: null,
    region: null,
    postalCode: null,
    countryCode: null,
    latitude: null,
    longitude: null,
    virtualMeetingUrl: null,
    virtualPlatform: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdByUserId: 'creator-id',
    updatedByUserId: 'creator-id',
    ...overrides,
  };
}

function makeEventRepo(overrides?: Partial<EventRepositoryPort>): EventRepositoryPort {
  return {
    findById: vi.fn().mockResolvedValue(null),
    listByGroupForUser: vi.fn().mockResolvedValue([]),
    listByOwner: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(null),
    cancel: vi.fn().mockResolvedValue(undefined),
    deleteEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeInvitationRepo(
  overrides?: Partial<EventInvitationRepositoryPort>,
): EventInvitationRepositoryPort {
  return {
    findByEventAndUser: vi.fn().mockResolvedValue(null),
    hasAccess: vi.fn().mockResolvedValue(false),
    listByEvent: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeLocationRepo(
  overrides?: Partial<EventLocationRepositoryPort>,
): EventLocationRepositoryPort {
  return {
    findByEvent: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(makeLocation()),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMemberRepo(overrides?: Partial<GroupMemberRepositoryPort>): GroupMemberRepositoryPort {
  return {
    findByGroupAndUser: vi.fn().mockResolvedValue(null),
    listByGroup: vi.fn().mockResolvedValue([]),
    add: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
    isMember: vi.fn().mockResolvedValue(false),
    getRole: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Validation unit tests
// ---------------------------------------------------------------------------

describe('validateSetLocationData', () => {
  it('accepts a valid physical location with displayText', () => {
    expect(() =>
      validateSetLocationData({ locationType: 'physical', displayText: 'Main Hall' }),
    ).not.toThrow();
  });

  it('accepts a valid physical location with streetAddress', () => {
    expect(() =>
      validateSetLocationData({ locationType: 'physical', streetAddress: '123 Main St' }),
    ).not.toThrow();
  });

  it('rejects a physical location without displayText or streetAddress', () => {
    let err: unknown;
    try {
      validateSetLocationData({ locationType: 'physical' });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('accepts a valid virtual location with URL', () => {
    expect(() =>
      validateSetLocationData({
        locationType: 'virtual',
        virtualMeetingUrl: 'https://zoom.us/j/123',
      }),
    ).not.toThrow();
  });

  it('rejects a virtual location without virtualMeetingUrl', () => {
    let err: unknown;
    try {
      validateSetLocationData({ locationType: 'virtual' });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('accepts a valid hybrid location with both physical and virtual fields', () => {
    expect(() =>
      validateSetLocationData({
        locationType: 'hybrid',
        displayText: 'Office',
        virtualMeetingUrl: 'https://teams.microsoft.com/l/meeting/123',
      }),
    ).not.toThrow();
  });

  it('rejects a hybrid location without virtualMeetingUrl', () => {
    let err: unknown;
    try {
      validateSetLocationData({ locationType: 'hybrid', displayText: 'Office' });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a hybrid location without physical field', () => {
    let err: unknown;
    try {
      validateSetLocationData({
        locationType: 'hybrid',
        virtualMeetingUrl: 'https://zoom.us/j/123',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects latitude outside -90..90', () => {
    let err1: unknown;
    try {
      validateSetLocationData({ locationType: 'physical', displayText: 'Place', latitude: 91 });
    } catch (e) {
      err1 = e;
    }
    expect(err1).toMatchObject({ code: 'VALIDATION_ERROR' });

    let err2: unknown;
    try {
      validateSetLocationData({ locationType: 'physical', displayText: 'Place', latitude: -91 });
    } catch (e) {
      err2 = e;
    }
    expect(err2).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects longitude outside -180..180', () => {
    let err: unknown;
    try {
      validateSetLocationData({ locationType: 'physical', displayText: 'Place', longitude: 181 });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects countryCode that is not 2 uppercase letters', () => {
    let err1: unknown;
    try {
      validateSetLocationData({
        locationType: 'physical',
        displayText: 'Place',
        countryCode: 'us',
      });
    } catch (e) {
      err1 = e;
    }
    expect(err1).toMatchObject({ code: 'VALIDATION_ERROR' });

    let err2: unknown;
    try {
      validateSetLocationData({
        locationType: 'physical',
        displayText: 'Place',
        countryCode: 'USA',
      });
    } catch (e) {
      err2 = e;
    }
    expect(err2).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('accepts a valid 2-letter country code', () => {
    expect(() =>
      validateSetLocationData({
        locationType: 'physical',
        displayText: 'Place',
        countryCode: 'US',
      }),
    ).not.toThrow();
  });

  it('rejects an invalid virtualMeetingUrl', () => {
    let err: unknown;
    try {
      validateSetLocationData({
        locationType: 'virtual',
        virtualMeetingUrl: 'not-a-url',
      });
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

// ---------------------------------------------------------------------------
// Authorization unit tests
// ---------------------------------------------------------------------------

describe('GetEventLocationUseCase', () => {
  it('throws NOT_FOUND when event does not exist', async () => {
    const useCase = new GetEventLocationUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(null) }),
      makeInvitationRepo(),
      makeLocationRepo(),
    );
    const caller = FakeIdentity.random();
    await expect(useCase.execute(caller, 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when caller has no event access', async () => {
    const useCase = new GetEventLocationUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) }),
      makeLocationRepo(),
    );
    const caller = FakeIdentity.random();
    await expect(useCase.execute(caller, 'event-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('returns null when no location is set but caller has access', async () => {
    const caller = FakeIdentity.random();
    const useCase = new GetEventLocationUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeLocationRepo({ findByEvent: vi.fn().mockResolvedValue(null) }),
    );
    const result = await useCase.execute(caller, 'event-1');
    expect(result).toBeNull();
  });
});

describe('SetEventLocationUseCase', () => {
  it('throws NOT_FOUND when caller has no event access', async () => {
    const caller = FakeIdentity.random();
    const useCase = new SetEventLocationUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(makeEvent()) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(false) }),
      makeLocationRepo(),
      makeMemberRepo(),
    );
    await expect(
      useCase.execute(caller, 'event-1', {
        locationType: 'physical',
        displayText: 'Test',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN when caller is invited but not creator or admin', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ createdBy: 'someone-else' });
    const useCase = new SetEventLocationUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeLocationRepo(),
      makeMemberRepo({ getRole: vi.fn().mockResolvedValue('member') }),
    );
    await expect(
      useCase.execute(caller, 'event-1', {
        locationType: 'physical',
        displayText: 'Test',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('succeeds when caller is the event creator', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ createdBy: caller.userId });
    const upsert = vi.fn().mockResolvedValue(makeLocation());
    const useCase = new SetEventLocationUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeLocationRepo({ upsert }),
      makeMemberRepo(),
    );
    await useCase.execute(caller, 'event-1', {
      locationType: 'physical',
      displayText: 'Test',
    });
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('succeeds when caller is a group admin with event access', async () => {
    const caller = FakeIdentity.random();
    const event = makeEvent({ createdBy: 'someone-else' });
    const upsert = vi.fn().mockResolvedValue(makeLocation());
    const useCase = new SetEventLocationUseCase(
      makeEventRepo({ findById: vi.fn().mockResolvedValue(event) }),
      makeInvitationRepo({ hasAccess: vi.fn().mockResolvedValue(true) }),
      makeLocationRepo({ upsert }),
      makeMemberRepo({ getRole: vi.fn().mockResolvedValue('admin') }),
    );
    await useCase.execute(caller, 'event-1', {
      locationType: 'physical',
      displayText: 'Test',
    });
    expect(upsert).toHaveBeenCalledOnce();
  });
});
