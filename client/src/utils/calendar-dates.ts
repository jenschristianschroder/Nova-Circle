/**
 * Calendar date utility functions.
 *
 * Pure functions for computing date ranges, grid positions, and navigation
 * offsets used by the CalendarView component. All functions operate on
 * plain Date objects and are timezone-aware via the local timezone.
 */

export type ViewMode = 'day' | 'week' | 'month' | 'custom';

/** Inclusive start/end range for calendar queries. */
export interface DateRange {
  start: Date;
  end: Date;
}

// ── Day helpers ────────────────────────────────────────────────────────────────

/** Return a new Date set to midnight (00:00:00.000) of the given date. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Return a new Date set to 23:59:59.999 of the given date. */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Check if two dates fall on the same calendar day (local timezone). */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Return true when the date is today in local timezone. */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/** Add `days` to a date (can be negative). */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ── Week helpers ───────────────────────────────────────────────────────────────

/** Return Monday of the week containing the given date. */
export function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setDate(d.getDate() + diff);
  return d;
}

/** Return Sunday (end of week) for the week containing the given date. */
export function endOfWeek(date: Date): Date {
  return endOfDay(addDays(startOfWeek(date), 6));
}

// ── Month helpers ──────────────────────────────────────────────────────────────

/** Return the first day of the month containing the given date. */
export function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Return the last moment of the last day of the month. */
export function endOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Return the full grid range for a month view — from Monday of the first
 * week to Sunday of the last week. This may include days from the previous
 * or next month so the grid is always complete weeks.
 */
export function monthGridRange(date: Date): DateRange {
  return {
    start: startOfWeek(startOfMonth(date)),
    end: endOfWeek(endOfMonth(date)),
  };
}

/** Return the number of calendar weeks visible in the month grid. */
export function weeksInMonthGrid(date: Date): number {
  const { start, end } = monthGridRange(date);
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
}

// ── View-mode ranges ───────────────────────────────────────────────────────────

/** Compute the visible date range for a given view mode and anchor date. */
export function viewRange(mode: ViewMode, anchor: Date, customDays?: number): DateRange {
  switch (mode) {
    case 'day':
      return { start: startOfDay(anchor), end: endOfDay(anchor) };
    case 'week':
      return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
    case 'month':
      return monthGridRange(anchor);
    case 'custom':
      return {
        start: startOfDay(anchor),
        end: endOfDay(addDays(anchor, (customDays ?? 3) - 1)),
      };
  }
}

/** Navigate to the next period (returns new anchor date). */
export function navigateNext(mode: ViewMode, anchor: Date, customDays?: number): Date {
  switch (mode) {
    case 'day':
      return addDays(anchor, 1);
    case 'week':
      return addDays(anchor, 7);
    case 'month': {
      const d = new Date(anchor);
      d.setMonth(d.getMonth() + 1);
      return d;
    }
    case 'custom':
      return addDays(anchor, customDays ?? 3);
  }
}

/** Navigate to the previous period (returns new anchor date). */
export function navigatePrev(mode: ViewMode, anchor: Date, customDays?: number): Date {
  switch (mode) {
    case 'day':
      return addDays(anchor, -1);
    case 'week':
      return addDays(anchor, -7);
    case 'month': {
      const d = new Date(anchor);
      d.setMonth(d.getMonth() - 1);
      return d;
    }
    case 'custom':
      return addDays(anchor, -(customDays ?? 3));
  }
}

// ── Day grid helpers ───────────────────────────────────────────────────────────

/** Hours rendered in day/week views (0–23). */
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * Compute top position (%) and height (%) for an event within a 24-hour day.
 * Returns null if the event doesn't fall on the given day.
 */
export function eventDayPosition(
  eventStart: Date,
  eventEnd: Date | null,
  day: Date,
): { top: number; height: number } | null {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);

  const eStart = new Date(eventStart);
  const eEnd = eventEnd ? new Date(eventEnd) : new Date(eStart.getTime() + 60 * 60 * 1000); // default 1h

  // Event doesn't overlap this day at all
  if (eEnd <= dayStart || eStart >= dayEnd) return null;

  // Clamp to day boundaries
  const clampedStart = eStart < dayStart ? dayStart : eStart;
  const clampedEnd = eEnd > dayEnd ? dayEnd : eEnd;

  const minutesFromMidnight =
    clampedStart.getHours() * 60 + clampedStart.getMinutes();
  const durationMinutes =
    (clampedEnd.getTime() - clampedStart.getTime()) / (1000 * 60);

  const top = (minutesFromMidnight / (24 * 60)) * 100;
  const height = Math.max((durationMinutes / (24 * 60)) * 100, 1); // at least 1%

  return { top, height };
}

// ── Format helpers ─────────────────────────────────────────────────────────────

/** Format a date as "Mon 24 Mar" style for headers. */
export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Format a date as "March 2026" style for month header. */
export function formatMonthHeader(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** Format an hour (0–23) as "9 AM" / "2 PM". */
export function formatHour(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true });
}

/** Format a time as "9:30 AM". */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** Generate an array of Date objects for each day in the range [start, end]. */
export function daysInRange(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  let current = startOfDay(start);
  const last = startOfDay(end);
  while (current <= last) {
    days.push(new Date(current));
    current = addDays(current, 1);
  }
  return days;
}
