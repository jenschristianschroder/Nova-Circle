/**
 * Calendar page — primary calendar view for authenticated users.
 *
 * Displays personal events and shared group events across day, week,
 * month, and custom time-frame views.  Fetches data only for the
 * visible time window and persists the user's preferred view mode.
 * Supports group filtering with colour-coded events.
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
  type SharedGroupEventsResponse,
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
import { buildGroupColorMap, groupColorVar, PERSONAL_COLOR_VAR } from '../../utils/group-colors';
import { useCalendarFilter } from '../../hooks/useCalendarFilter';
import { CalendarToolbar } from './CalendarToolbar';
import { GroupFilterPanel } from './GroupFilterPanel';
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
  /** CSS variable for the event's group colour (e.g. `--nc-group-color-0`). */
  groupColorVar?: string;
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
  /** Mobile filter sheet open state. */
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Group IDs for filter hook
  const allGroupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const filter = useCalendarFilter(allGroupIds);

  // Stable group colour map
  const groupColorMap = useMemo(() => buildGroupColorMap(allGroupIds), [allGroupIds]);

  // Persist preferences
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MODE, mode);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CUSTOM_DAYS, String(customDays));
  }, [customDays]);

  // Compute visible range
  const range = useMemo(() => viewRange(mode, anchor, customDays), [mode, anchor, customDays]);

  // Fetch data when the visible range or filter changes
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const from = range.start.toISOString();
    const to = range.end.toISOString();

    try {
      // Always fetch groups list first for the shared events
      const groupsList = await listMyGroups(apiFetch);
      setGroups(groupsList);

      // Determine which groups are currently visible using the filter's
      // raw state (not visibleGroupIds, which depends on React state)
      const visibleGroups = groupsList.filter((g) => filter.isGroupVisible(g.id));

      // Helper: fetch all pages of group events for a given group
      async function fetchAllGroupEvents(
        groupId: string,
        dateFrom: string,
        dateTo: string,
      ): Promise<SharedGroupEventsResponse> {
        const first = await listGroupEvents(apiFetch, groupId, {
          from: dateFrom,
          to: dateTo,
          limit: 100,
          page: 1,
        });
        const allEvents = [...first.events];
        let page = 2;
        const maxPages = 20; // safety limit to prevent infinite loops
        while (allEvents.length < first.total && page <= maxPages) {
          const next = await listGroupEvents(apiFetch, groupId, {
            from: dateFrom,
            to: dateTo,
            limit: 100,
            page,
          });
          if (next.events.length === 0) break; // no more results
          allEvents.push(...next.events);
          page++;
        }
        return { ...first, events: allEvents };
      }

      // Fetch personal events only when shown, and shared events only for visible groups
      const promises: Promise<CalendarEvent[] | SharedGroupEventsResponse>[] = [];
      if (filter.showPersonal) {
        promises.push(listPersonalEvents(apiFetch, { from, to }));
      }
      promises.push(...visibleGroups.map((g) => fetchAllGroupEvents(g.id, from, to)));

      const results = await Promise.all(promises);

      // Split results — first is personal (if fetched), rest are group results
      let personalResult: CalendarEvent[] = [];
      let groupResults: SharedGroupEventsResponse[];
      if (filter.showPersonal) {
        personalResult = results[0] as CalendarEvent[];
        groupResults = results.slice(1) as SharedGroupEventsResponse[];
      } else {
        groupResults = results as SharedGroupEventsResponse[];
      }

      setPersonalEvents(personalResult);

      // Merge shared events from all groups, dedup by event id, track group origin
      const allShared: SharedGroupEvent[] = [];
      const seen = new Set<string>();
      const eventGroupMap = new Map<string, string>();
      for (let i = 0; i < groupResults.length; i++) {
        const groupId = visibleGroups[i].id;
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
  }, [apiFetch, range, filter.showPersonal, filter.isGroupVisible]);

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
        groupColorVar: PERSONAL_COLOR_VAR,
      });
    }

    // Shared events — respect visibility level, skip duplicates
    for (const ev of sharedEvents) {
      if (seenIds.has(ev.id)) continue;
      seenIds.add(ev.id);
      const originGroupId = sharedEventGroupMap.get(ev.id) ?? null;
      const slot = originGroupId ? (groupColorMap.get(originGroupId) ?? 0) : 0;
      events.push({
        id: ev.id,
        title:
          ev.visibilityLevel === 'busy'
            ? `${ev.ownerDisplayName} — Busy`
            : (ev.title ?? 'Untitled'),
        startAt: ev.startAt,
        endAt: ev.endAt,
        visibilityLevel: ev.visibilityLevel,
        ownerDisplayName: ev.ownerDisplayName,
        groupId: originGroupId,
        status: ev.status,
        description: ev.visibilityLevel === 'details' ? ev.description : undefined,
        groupColorVar: groupColorVar(slot),
      });
    }

    return events;
  }, [personalEvents, sharedEvents, sharedEventGroupMap, groupColorMap]);

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
        filterButton={
          <button
            type="button"
            className={`${styles.mobileFilterToggle}`}
            onClick={() => setMobileFilterOpen(true)}
            aria-label="Open calendar filter"
          >
            ☰ Filter
          </button>
        }
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
        <div className={styles.calendarBody}>
          <GroupFilterPanel
            groups={groups}
            groupColorMap={groupColorMap}
            showPersonal={filter.showPersonal}
            isGroupVisible={filter.isGroupVisible}
            onTogglePersonal={filter.togglePersonal}
            onToggleGroup={filter.toggleGroup}
            onSelectAll={filter.selectAll}
            onDeselectAll={filter.deselectAll}
          />
          <div className={styles.viewContainer}>{renderView()}</div>
        </div>
      )}

      {/* Mobile filter sheet */}
      {mobileFilterOpen && (
        <div
          className={styles.filterOverlay}
          onClick={() => setMobileFilterOpen(false)}
          role="presentation"
        >
          <div
            className={styles.filterSheet}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Calendar filter"
          >
            <div className={styles.filterSheetClose}>
              <button
                type="button"
                onClick={() => setMobileFilterOpen(false)}
                aria-label="Close filter"
              >
                ✕
              </button>
            </div>
            <GroupFilterPanel
              groups={groups}
              groupColorMap={groupColorMap}
              showPersonal={filter.showPersonal}
              isGroupVisible={filter.isGroupVisible}
              onTogglePersonal={filter.togglePersonal}
              onToggleGroup={filter.toggleGroup}
              onSelectAll={filter.selectAll}
              onDeselectAll={filter.deselectAll}
            />
          </div>
        </div>
      )}
    </main>
  );
}
