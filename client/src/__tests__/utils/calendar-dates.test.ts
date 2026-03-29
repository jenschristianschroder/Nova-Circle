/**
 * Tests for calendar date utility functions.
 *
 * Validates date range computation, navigation, event positioning,
 * and format helpers used by the calendar views.
 */

import { describe, it, expect } from 'vitest';
import {
  startOfDay,
  endOfDay,
  isSameDay,
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  monthGridRange,
  weeksInMonthGrid,
  viewRange,
  navigateNext,
  navigatePrev,
  eventDayPosition,
  daysInRange,
  formatHour,
} from '../../utils/calendar-dates';

// ── Day helpers ────────────────────────────────────────────────────────────────

describe('startOfDay', () => {
  it('sets time to midnight', () => {
    const d = startOfDay(new Date(2026, 2, 15, 14, 30, 45, 123));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
    expect(d.getDate()).toBe(15);
  });

  it('does not mutate the original date', () => {
    const orig = new Date(2026, 2, 15, 14, 30);
    startOfDay(orig);
    expect(orig.getHours()).toBe(14);
  });
});

describe('endOfDay', () => {
  it('sets time to 23:59:59.999', () => {
    const d = endOfDay(new Date(2026, 2, 15, 8));
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
    expect(d.getMilliseconds()).toBe(999);
  });
});

describe('isSameDay', () => {
  it('returns true for same calendar day', () => {
    expect(isSameDay(new Date(2026, 2, 15, 8), new Date(2026, 2, 15, 22))).toBe(true);
  });

  it('returns false for different days', () => {
    expect(isSameDay(new Date(2026, 2, 15), new Date(2026, 2, 16))).toBe(false);
  });

  it('returns false for different months', () => {
    expect(isSameDay(new Date(2026, 2, 15), new Date(2026, 3, 15))).toBe(false);
  });
});

describe('addDays', () => {
  it('adds positive days', () => {
    const d = addDays(new Date(2026, 2, 15), 5);
    expect(d.getDate()).toBe(20);
  });

  it('subtracts with negative days', () => {
    const d = addDays(new Date(2026, 2, 15), -3);
    expect(d.getDate()).toBe(12);
  });

  it('crosses month boundaries', () => {
    const d = addDays(new Date(2026, 0, 30), 5);
    expect(d.getMonth()).toBe(1); // February
    expect(d.getDate()).toBe(4);
  });
});

// ── Week helpers ───────────────────────────────────────────────────────────────

describe('startOfWeek', () => {
  it('returns Monday for a Wednesday', () => {
    // 2026-03-18 is a Wednesday
    const d = startOfWeek(new Date(2026, 2, 18));
    expect(d.getDay()).toBe(1); // Monday
    expect(d.getDate()).toBe(16);
  });

  it('returns the same day for a Monday', () => {
    // 2026-03-16 is a Monday
    const d = startOfWeek(new Date(2026, 2, 16));
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(16);
  });

  it('returns previous Monday for a Sunday', () => {
    // 2026-03-22 is a Sunday
    const d = startOfWeek(new Date(2026, 2, 22));
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(16);
  });
});

describe('endOfWeek', () => {
  it('returns Sunday at end of day', () => {
    const d = endOfWeek(new Date(2026, 2, 18));
    expect(d.getDay()).toBe(0); // Sunday
    expect(d.getDate()).toBe(22);
    expect(d.getHours()).toBe(23);
  });
});

// ── Month helpers ──────────────────────────────────────────────────────────────

describe('startOfMonth', () => {
  it('returns the first day of the month', () => {
    const d = startOfMonth(new Date(2026, 2, 18));
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(2);
    expect(d.getHours()).toBe(0);
  });
});

describe('endOfMonth', () => {
  it('returns the last day of the month', () => {
    const d = endOfMonth(new Date(2026, 2, 18));
    expect(d.getDate()).toBe(31); // March has 31 days
    expect(d.getHours()).toBe(23);
  });

  it('handles February', () => {
    const d = endOfMonth(new Date(2026, 1, 15));
    expect(d.getDate()).toBe(28);
  });

  it('handles leap year February', () => {
    const d = endOfMonth(new Date(2028, 1, 15));
    expect(d.getDate()).toBe(29);
  });
});

describe('monthGridRange', () => {
  it('returns a range from Monday before month start to Sunday after month end', () => {
    // March 2026: starts on Sunday, ends on Tuesday
    const { start, end } = monthGridRange(new Date(2026, 2, 15));
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0);   // Sunday
    expect(end.getHours()).toBe(23);
    // The range must contain the entire month
    expect(start.getTime()).toBeLessThanOrEqual(new Date(2026, 2, 1).getTime());
    expect(end.getTime()).toBeGreaterThanOrEqual(new Date(2026, 2, 31).getTime());
  });
});

describe('weeksInMonthGrid', () => {
  it('returns at least 4 weeks', () => {
    expect(weeksInMonthGrid(new Date(2026, 2, 15))).toBeGreaterThanOrEqual(4);
  });

  it('returns at most 6 weeks', () => {
    expect(weeksInMonthGrid(new Date(2026, 2, 15))).toBeLessThanOrEqual(6);
  });

  it('returns exactly 6 weeks for March 2026', () => {
    // March 2026: starts Sunday → grid starts Mon Feb 23, ends Sun Apr 5 → 6 rows
    expect(weeksInMonthGrid(new Date(2026, 2, 15))).toBe(6);
  });

  it('returns exactly 5 weeks for May 2026', () => {
    // May 2026: starts Friday, ends Sunday → grid starts Mon Apr 27, ends Sun May 31 → 5 rows
    expect(weeksInMonthGrid(new Date(2026, 4, 1))).toBe(5);
  });

  it('returns exactly 4 weeks for February 2021', () => {
    // February 2021: 1st is Monday, 28th is Sunday → exactly 4 week rows
    expect(weeksInMonthGrid(new Date(2021, 1, 1))).toBe(4);
  });
});

// ── View-mode ranges ───────────────────────────────────────────────────────────

describe('viewRange', () => {
  it('returns single day range for day mode', () => {
    const { start, end } = viewRange('day', new Date(2026, 2, 15));
    expect(start.getDate()).toBe(15);
    expect(end.getDate()).toBe(15);
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
  });

  it('returns 7-day range for week mode', () => {
    const { start, end } = viewRange('week', new Date(2026, 2, 18));
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0);   // Sunday
    // The range covers Mon 00:00 to Sun 23:59 — 7 calendar days
    const startDay = start.getDate();
    const endDay = end.getDate();
    expect(endDay - startDay).toBe(6); // 6 days apart = 7 calendar days
  });

  it('returns month grid range for month mode', () => {
    const { start, end } = viewRange('month', new Date(2026, 2, 15));
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0);   // Sunday
  });

  it('returns custom N-day range', () => {
    const { start, end } = viewRange('custom', new Date(2026, 2, 15), 5);
    expect(start.getDate()).toBe(15);
    expect(end.getDate()).toBe(19);
  });

  it('defaults to 3 days for custom mode without customDays', () => {
    const { start, end } = viewRange('custom', new Date(2026, 2, 15));
    expect(start.getDate()).toBe(15);
    expect(end.getDate()).toBe(17);
  });
});

// ── Navigation ─────────────────────────────────────────────────────────────────

describe('navigateNext', () => {
  it('advances by 1 day in day mode', () => {
    const next = navigateNext('day', new Date(2026, 2, 15));
    expect(next.getDate()).toBe(16);
  });

  it('advances by 7 days in week mode', () => {
    const next = navigateNext('week', new Date(2026, 2, 15));
    expect(next.getDate()).toBe(22);
  });

  it('advances by 1 month in month mode', () => {
    const next = navigateNext('month', new Date(2026, 2, 15));
    expect(next.getMonth()).toBe(3);
    expect(next.getDate()).toBe(15);
  });

  it('advances by customDays in custom mode', () => {
    const next = navigateNext('custom', new Date(2026, 2, 15), 5);
    expect(next.getDate()).toBe(20);
  });
});

describe('navigatePrev', () => {
  it('goes back 1 day in day mode', () => {
    const prev = navigatePrev('day', new Date(2026, 2, 15));
    expect(prev.getDate()).toBe(14);
  });

  it('goes back 7 days in week mode', () => {
    const prev = navigatePrev('week', new Date(2026, 2, 15));
    expect(prev.getDate()).toBe(8);
  });

  it('goes back 1 month in month mode', () => {
    const prev = navigatePrev('month', new Date(2026, 2, 15));
    expect(prev.getMonth()).toBe(1);
  });

  it('goes back by customDays in custom mode', () => {
    const prev = navigatePrev('custom', new Date(2026, 2, 15), 5);
    expect(prev.getDate()).toBe(10);
  });
});

// ── Event day position ─────────────────────────────────────────────────────────

describe('eventDayPosition', () => {
  it('positions an event in the morning', () => {
    const start = new Date(2026, 2, 15, 9, 0); // 9:00
    const end = new Date(2026, 2, 15, 10, 0);  // 10:00
    const day = new Date(2026, 2, 15);

    const pos = eventDayPosition(start, end, day);
    expect(pos).not.toBeNull();
    // 9:00 = 540 minutes / 1440 total = 37.5%
    expect(pos!.top).toBeCloseTo(37.5, 1);
    // 60 minutes / 1440 = ~4.17%
    expect(pos!.height).toBeCloseTo(4.17, 1);
  });

  it('returns null for an event on a different day', () => {
    const start = new Date(2026, 2, 16, 9, 0);
    const end = new Date(2026, 2, 16, 10, 0);
    const day = new Date(2026, 2, 15);

    expect(eventDayPosition(start, end, day)).toBeNull();
  });

  it('clamps multi-day events to the target day', () => {
    const start = new Date(2026, 2, 14, 22, 0); // starts day before
    const end = new Date(2026, 2, 15, 3, 0);    // ends at 3 AM
    const day = new Date(2026, 2, 15);

    const pos = eventDayPosition(start, end, day);
    expect(pos).not.toBeNull();
    expect(pos!.top).toBe(0); // clamped to midnight
    // 3 hours = 180 minutes / 1440 = 12.5%
    expect(pos!.height).toBeCloseTo(12.5, 1);
  });

  it('defaults to 1 hour for events without an end time', () => {
    const start = new Date(2026, 2, 15, 14, 0);
    const day = new Date(2026, 2, 15);

    const pos = eventDayPosition(start, null, day);
    expect(pos).not.toBeNull();
    expect(pos!.height).toBeCloseTo(4.17, 1);
  });
});

// ── daysInRange ────────────────────────────────────────────────────────────────

describe('daysInRange', () => {
  it('generates correct number of days', () => {
    const days = daysInRange(new Date(2026, 2, 10), new Date(2026, 2, 15));
    expect(days).toHaveLength(6);
    expect(days[0].getDate()).toBe(10);
    expect(days[5].getDate()).toBe(15);
  });

  it('returns single day for same start and end', () => {
    const days = daysInRange(new Date(2026, 2, 15), new Date(2026, 2, 15));
    expect(days).toHaveLength(1);
  });
});

// ── Format helpers ─────────────────────────────────────────────────────────────

describe('formatHour', () => {
  it('formats midnight', () => {
    const result = formatHour(0);
    // Could be "12 AM" or "0:00" depending on locale, just check it returns a string
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats noon', () => {
    const result = formatHour(12);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});
