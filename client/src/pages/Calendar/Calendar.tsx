/**
 * Calendar page — primary calendar view for authenticated users.
 *
 * Displays personal events and shared group events across day, week,
 * month, and custom time-frame views.  Fetches data only for the
 * visible time window and persists the user's preferred view mode.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import {
  listPersonalEvents,
  listGroupEvents,
  type CalendarEvent,
  type SharedGroupEvent,
  type VisibilityLevel,
} from '../../api/events';
import { listMyGroups, type Group } from '../../api/groups';
import {
  type ViewMode,
  viewRange,
  navigateNext,
  navigatePrev,
  startOfDay,
} from '../../utils/calendar-dates';
import { CalendarToolbar } from './CalendarToolbar';
import { DayView } from './DayView';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import styles from './Calendar.module.css';

// ── Unified event type used within the calendar ────────────────────────────────

export interface CalendarDisplayEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  visibilityLevel: VisibilityLevel | 'owner';
  ownerDisplayName?: string;
  groupId: string | null;
  status?: string;
  description?: string | null;
}

const STORAGE_KEY_MODE = 'nc-calendar-view-mode';
const STORAGE_KEY_CUSTOM_DAYS = 'nc-calendar-custom-days';

function loadPersistedMode(): ViewMode {
  const stored = localStorage.getItem(STORAGE_KEY_MODE);
  if (stored === 'day' || stored === 'week' || stored === 'month' || stored === 'custom') {
    return stored;
  }
  return 'month';
}

function loadPersistedCustomDays(): number {
  const stored = localStorage.getItem(STORAGE_KEY_CUSTOM_DAYS);
  const parsed = stored ? parseInt(stored, 10) : NaN;
  return !isNaN(parsed) && parsed >= 1 && parsed <= 90 ? parsed : 3;
}

export function Calendar() {
  const navigate = useNavigate();
  const { apiFetch } = useApiClient();
  const { account } = useAuth();
  const callerUserId = account?.localAccountId;

  const [mode, setMode] = useState<ViewMode>(loadPersistedMode);
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [customDays, setCustomDays] = useState(loadPersistedCustomDays);
  const [personalEvents, setPersonalEvents] = useState<CalendarEvent[]>([]);
  const [sharedEvents, setSharedEvents] = useState<SharedGroupEvent[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Maps shared event id → originating group id for navigation. */
  const [sharedEventGroupMap, setSharedEventGroupMap] = useState<Map<string, string>>(new Map());

  // Persist preferences
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MODE, mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CUSTOM_DAYS, String(customDays));
  }, [customDays]);

  // Compute visible range
  const range = useMemo(() => viewRange(mode, anchor, customDays), [mode, anchor, customDays]);

  // Fetch data when the visible range changes
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const from = range.start.toISOString();
    const to = range.end.toISOString();

    try {
      // Always fetch groups list first for the shared events
      const groupsList = await listMyGroups(apiFetch);
      setGroups(groupsList);

      // Fetch personal events and shared events in parallel
      const [personal, ...groupResults] = await Promise.all([
        listPersonalEvents(apiFetch, { from, to }),
        ...groupsList.map((g) =>
          listGroupEvents(apiFetch, g.id, { from, to, limit: 100 }),
        ),
      ]);

      setPersonalEvents(personal);

      // Merge shared events from all groups, dedup by event id, track group origin
      const allShared: SharedGroupEvent[] = [];
      const seen = new Set<string>();
      const eventGroupMap = new Map<string, string>();
      for (let i = 0; i < groupResults.length; i++) {
        const groupId = groupsList[i].id;
        for (const ev of groupResults[i].events) {
          if (!seen.has(ev.id)) {
            seen.add(ev.id);
            allShared.push(ev);
            eventGroupMap.set(ev.id, groupId);
          }
        }
      }
      setSharedEvents(allShared);
      setSharedEventGroupMap(eventGroupMap);
    } catch {
      setError('Failed to load calendar events. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, range]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Merge personal + shared into unified display events
  const displayEvents = useMemo<CalendarDisplayEvent[]>(() => {
    const events: CalendarDisplayEvent[] = [];
    const seenIds = new Set<string>();

    // Personal events — full detail for owner
    for (const ev of personalEvents) {
      seenIds.add(ev.id);
      events.push({
        id: ev.id,
        title: ev.title || 'Untitled',
        startAt: ev.startAt,
        endAt: ev.endAt,
        visibilityLevel: 'owner',
        groupId: ev.groupId,
        status: ev.status,
        description: ev.description,
      });
    }

    // Shared events — respect visibility level, skip duplicates
    for (const ev of sharedEvents) {
      if (seenIds.has(ev.id)) continue;
      seenIds.add(ev.id);
      events.push({
        id: ev.id,
        title:
          ev.visibilityLevel === 'busy'
            ? `${ev.ownerDisplayName} — Busy`
            : ev.title ?? 'Untitled',
        startAt: ev.startAt,
        endAt: ev.endAt,
        visibilityLevel: ev.visibilityLevel,
        ownerDisplayName: ev.ownerDisplayName,
        groupId: sharedEventGroupMap.get(ev.id) ?? null,
        status: ev.status,
        description: ev.visibilityLevel === 'details' ? ev.description : undefined,
      });
    }

    return events;
  }, [personalEvents, sharedEvents, sharedEventGroupMap]);

  // Navigation handlers
  const handlePrev = useCallback(() => {
    setAnchor((a) => navigatePrev(mode, a, customDays));
  }, [mode, customDays]);

  const handleNext = useCallback(() => {
    setAnchor((a) => navigateNext(mode, a, customDays));
  }, [mode, customDays]);

  const handleToday = useCallback(() => {
    setAnchor(startOfDay(new Date()));
  }, []);

  const handleDateSelect = useCallback((date: Date) => {
    setAnchor(startOfDay(date));
  }, []);

  const handleModeChange = useCallback((newMode: ViewMode) => {
    setMode(newMode);
  }, []);

  const handleCustomDaysChange = useCallback((days: number) => {
    setCustomDays(days);
  }, []);

  // Event click — navigate to event detail if allowed
  const handleEventClick = useCallback(
    (event: CalendarDisplayEvent) => {
      if (event.visibilityLevel === 'busy' || event.visibilityLevel === 'title') return;

      // Navigate to group event detail using the event's associated group
      if (event.groupId) {
        navigate(`/groups/${event.groupId}/events/${event.id}`);
      }
    },
    [navigate],
  );

  // Time slot click — navigate to event creation
  const handleTimeSlotClick = useCallback(
    (date: Date) => {
      // For now store the pre-fill date in sessionStorage for the create form
      sessionStorage.setItem('nc-prefill-start', date.toISOString());
      // If user has groups, navigate to first group's event creation
      if (groups.length > 0) {
        navigate(`/groups/${groups[0].id}/events/new`);
      }
    },
    [navigate, groups],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  const renderView = () => {
    const viewProps = {
      events: displayEvents,
      anchor,
      onEventClick: handleEventClick,
      onTimeSlotClick: handleTimeSlotClick,
      callerUserId: callerUserId ?? undefined,
    };

    switch (mode) {
      case 'day':
        return <DayView {...viewProps} />;
      case 'week':
        return <WeekView {...viewProps} />;
      case 'month':
        return <MonthView {...viewProps} />;
      case 'custom':
        return <DayView {...viewProps} customDays={customDays} />;
    }
  };

  return (
    <main className={styles.page} aria-label="Calendar">
      <CalendarToolbar
        mode={mode}
        anchor={anchor}
        customDays={customDays}
        onModeChange={handleModeChange}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onDateSelect={handleDateSelect}
        onCustomDaysChange={handleCustomDaysChange}
      />

      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}

      {isLoading ? (
        <div className={styles.loading} aria-live="polite" aria-busy="true">
          Loading calendar…
        </div>
      ) : (
        <div className={styles.viewContainer}>{renderView()}</div>
      )}
    </main>
  );
}
