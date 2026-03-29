/**
 * MonthView — traditional month grid with event indicators in each day cell.
 *
 * Shows a 6-row grid (Mon–Sun columns) covering the full month plus
 * padding days from adjacent months.
 */

import { type CalendarDisplayEvent } from './Calendar';
import { EventBlock } from './EventBlock';
import {
  monthGridRange,
  daysInRange,
  isToday,
  startOfDay,
  formatDayHeader,
} from '../../utils/calendar-dates';
import styles from './Calendar.module.css';

interface MonthViewProps {
  events: CalendarDisplayEvent[];
  anchor: Date;
  onEventClick: (event: CalendarDisplayEvent) => void;
  onTimeSlotClick: (date: Date) => void;
  callerUserId?: string;
}

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function eventsForDay(events: CalendarDisplayEvent[], day: Date): CalendarDisplayEvent[] {
  return events.filter((ev) => {
    const eStart = new Date(ev.startAt);
    const eEnd = ev.endAt ? new Date(ev.endAt) : new Date(eStart.getTime() + 60 * 60 * 1000);
    const dayStart = startOfDay(day);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    return eEnd > dayStart && eStart < dayEnd;
  });
}

/** Maximum events to show per day cell before collapsing. */
const MAX_VISIBLE_EVENTS = 3;

export function MonthView({ events, anchor, onEventClick, onTimeSlotClick }: MonthViewProps) {
  const { start, end } = monthGridRange(anchor);
  const days = daysInRange(start, end);
  const currentMonth = anchor.getMonth();

  return (
    <div className={styles.monthGrid} role="grid" aria-label="Month view">
      {/* Weekday header row */}
      <div className={styles.monthWeekdayRow} role="row">
        {WEEKDAY_HEADERS.map((day) => (
          <div key={day} className={styles.monthWeekdayCell} role="columnheader">
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className={styles.monthDayGrid} role="rowgroup">
        {days.map((day) => {
          const dayEvents = eventsForDay(events, day);
          const isCurrentMonth = day.getMonth() === currentMonth;
          const todayClass = isToday(day) ? styles.monthDayToday : '';
          const outsideClass = !isCurrentMonth ? styles.monthDayOutside : '';

          return (
            <div
              key={day.toISOString()}
              className={`${styles.monthDayCell} ${todayClass} ${outsideClass}`}
              role="gridcell"
              aria-label={formatDayHeader(day)}
            >
              <button
                type="button"
                className={styles.monthDayNumber}
                onClick={() => onTimeSlotClick(day)}
                aria-label={`Create event on ${formatDayHeader(day)}`}
              >
                {day.getDate()}
              </button>

              <div className={styles.monthDayEvents}>
                {dayEvents.slice(0, MAX_VISIBLE_EVENTS).map((ev) => (
                  <EventBlock key={ev.id} event={ev} onClick={onEventClick} showTime={false} />
                ))}
                {dayEvents.length > MAX_VISIBLE_EVENTS && (
                  <span className={styles.monthDayMore}>
                    +{dayEvents.length - MAX_VISIBLE_EVENTS} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
