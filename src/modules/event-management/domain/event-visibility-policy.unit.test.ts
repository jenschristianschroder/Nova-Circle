import { describe, it, expect } from 'vitest';
import { EventVisibilityPolicy, type VisibilityInput } from './event-visibility-policy.js';
import type { VisibilityLevel } from '../../event-sharing/domain/event-share.js';

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

function makeInput(overrides?: Partial<VisibilityInput>): VisibilityInput {
  return {
    eventId: 'event-1',
    ownerId: 'owner-1',
    ownerDisplayName: 'Alice',
    title: 'Team Lunch',
    description: 'Bring your own salad',
    startAt: new Date('2026-06-01T12:00:00Z'),
    endAt: new Date('2026-06-01T13:00:00Z'),
    status: 'scheduled',
    visibilityLevel: 'details',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sanitizeLevel
// ---------------------------------------------------------------------------

describe('EventVisibilityPolicy.sanitizeLevel', () => {
  it.each<VisibilityLevel>(['busy', 'title', 'details'])(
    'returns "%s" unchanged for a recognised level',
    (level) => {
      expect(EventVisibilityPolicy.sanitizeLevel(level)).toBe(level);
    },
  );

  it.each(['unknown', '', 'BUSY', 'Title', 'DETAILS', 'full', 'none', 'private'])(
    'coerces unrecognised value "%s" to "busy"',
    (raw) => {
      expect(EventVisibilityPolicy.sanitizeLevel(raw)).toBe('busy');
    },
  );
});

// ---------------------------------------------------------------------------
// filterRecord — busy level
// ---------------------------------------------------------------------------

describe('EventVisibilityPolicy.filterRecord — busy level', () => {
  it('includes only base fields (id, owner, times, visibilityLevel)', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({ visibilityLevel: 'busy', title: 'Secret', description: 'Top secret' }),
    );

    expect(result.id).toBe('event-1');
    expect(result.ownerId).toBe('owner-1');
    expect(result.ownerDisplayName).toBe('Alice');
    expect(result.startAt).toBe('2026-06-01T12:00:00.000Z');
    expect(result.endAt).toBe('2026-06-01T13:00:00.000Z');
    expect(result.visibilityLevel).toBe('busy');
  });

  it('does NOT expose title', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({ visibilityLevel: 'busy', title: 'Sensitive Title' }),
    );
    expect(result).not.toHaveProperty('title');
  });

  it('does NOT expose description', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({ visibilityLevel: 'busy', description: 'Private details' }),
    );
    expect(result).not.toHaveProperty('description');
  });

  it('does NOT expose status', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({ visibilityLevel: 'busy', status: 'cancelled' }),
    );
    expect(result).not.toHaveProperty('status');
  });

  it('handles null endAt', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({ visibilityLevel: 'busy', endAt: null }),
    );
    expect(result.endAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// filterRecord — title level
// ---------------------------------------------------------------------------

describe('EventVisibilityPolicy.filterRecord — title level', () => {
  it('includes base fields plus title and status', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({ visibilityLevel: 'title', title: 'Standup', status: 'scheduled' }),
    );

    expect(result.id).toBe('event-1');
    expect(result.ownerId).toBe('owner-1');
    expect(result.visibilityLevel).toBe('title');
    expect(result.title).toBe('Standup');
    expect(result.status).toBe('scheduled');
  });

  it('does NOT expose description', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({ visibilityLevel: 'title', description: 'Confidential agenda' }),
    );
    expect(result).not.toHaveProperty('description');
  });
});

// ---------------------------------------------------------------------------
// filterRecord — details level
// ---------------------------------------------------------------------------

describe('EventVisibilityPolicy.filterRecord — details level', () => {
  it('includes all fields: base + title + description + status', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({
        visibilityLevel: 'details',
        title: 'Full Event',
        description: 'Everything visible',
        status: 'scheduled',
      }),
    );

    expect(result.id).toBe('event-1');
    expect(result.visibilityLevel).toBe('details');
    expect(result.title).toBe('Full Event');
    expect(result.description).toBe('Everything visible');
    expect(result.status).toBe('scheduled');
  });

  it('includes null description when the event has no description', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({ visibilityLevel: 'details', description: null }),
    );
    expect(result.description).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// filterRecord — fail-closed behaviour
// ---------------------------------------------------------------------------

describe('EventVisibilityPolicy.filterRecord — fail-closed behaviour', () => {
  it('unknown visibility level is coerced to busy (no title, description, or status)', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({
        visibilityLevel: 'unknown_level' as VisibilityLevel,
        title: 'Secret',
        description: 'Secret',
      }),
    );

    expect(result.visibilityLevel).toBe('busy');
    expect(result).not.toHaveProperty('title');
    expect(result).not.toHaveProperty('description');
    expect(result).not.toHaveProperty('status');
  });

  it('empty string visibility level is coerced to busy', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({
        visibilityLevel: '' as VisibilityLevel,
        title: 'Should Be Hidden',
        description: 'Also hidden',
      }),
    );

    expect(result.visibilityLevel).toBe('busy');
    expect(result).not.toHaveProperty('title');
    expect(result).not.toHaveProperty('description');
    expect(result).not.toHaveProperty('status');
  });

  it('case-sensitive: "Busy" (capitalised) is coerced to busy', () => {
    const result = EventVisibilityPolicy.filterRecord(
      makeInput({
        visibilityLevel: 'Busy' as VisibilityLevel,
        title: 'Hidden',
      }),
    );

    expect(result.visibilityLevel).toBe('busy');
    expect(result).not.toHaveProperty('title');
  });
});

// ---------------------------------------------------------------------------
// Privacy guarantee: sensitive fields never leak at lower visibility levels
// ---------------------------------------------------------------------------

describe('EventVisibilityPolicy — privacy guarantees', () => {
  const sensitiveInput = makeInput({
    title: 'Private Doctor Appointment',
    description: 'Follow-up for medical condition XYZ',
    status: 'scheduled',
  });

  it('busy level never exposes title, description, or status', () => {
    const result = EventVisibilityPolicy.filterRecord({
      ...sensitiveInput,
      visibilityLevel: 'busy',
    });

    const keys = Object.keys(result);
    expect(keys).not.toContain('title');
    expect(keys).not.toContain('description');
    expect(keys).not.toContain('status');
  });

  it('title level never exposes description', () => {
    const result = EventVisibilityPolicy.filterRecord({
      ...sensitiveInput,
      visibilityLevel: 'title',
    });

    const keys = Object.keys(result);
    expect(keys).not.toContain('description');
    // title and status ARE expected
    expect(keys).toContain('title');
    expect(keys).toContain('status');
  });

  it('output object has no extra prototype-inherited data fields', () => {
    const result = EventVisibilityPolicy.filterRecord({
      ...sensitiveInput,
      visibilityLevel: 'busy',
    });

    // Only own enumerable keys should be present
    const ownKeys = Object.keys(result);
    expect(ownKeys).toEqual([
      'id',
      'ownerId',
      'ownerDisplayName',
      'startAt',
      'endAt',
      'visibilityLevel',
    ]);
  });
});
