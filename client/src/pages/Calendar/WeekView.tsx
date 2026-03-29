/**
 * WeekView — renders a 7-day grid (Mon–Sun) with hourly time slots.
 *
 * Reuses the day-column pattern from DayView but always shows 7 columns
 * with day headers.
 */

import { type CalendarDisplayEvent } from './Calendar';
import { EventBlock } from './EventBlock';
import {
  HOURS,
  formatHour,
  formatDayHeader,
  eventDayPosition,
  startOfWeek,
  addDays,
  startOfDay,
  isToday,
} from '../../utils/calendar-dates';
import styles from './Calendar.module.css';

interface WeekViewProps {
  events: CalendarDisplayEvent[];
  anchor: Date;
  onEventClick: (event: CalendarDisplayEvent) => void;
  onTimeSlotClick: (date: Date) => void;
  callerUserId?: string;
}

function eventsForDay(events: CalendarDisplayEvent[], day: Date): CalendarDisplayEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(23, 59, 59, 999);

  return events.filter((ev) => {
    const eStart = new Date(ev.startAt);
    const eEnd = ev.endAt
      ? new Date(ev.endAt)
      : new Date(eStart.getTime() + 60 * 60 * 1000);
    return eEnd > dayStart && eStart < dayEnd;
  });
}

export function WeekView({
  events,
  anchor,
  onEventClick,
  onTimeSlotClick,
}: WeekViewProps) {
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className={styles.dayViewContainer} role="grid" aria-label="Week view">
      {/* Time gutter */}
      <div className={styles.timeGutter}>
        <div className={styles.dayColumnHeader}>&nbsp;</div>
        {HOURS.map((hour) => (
          <div key={hour} className={styles.timeGutterLabel}>
            {formatHour(hour)}
          </div>
        ))}
      </div>

      {/* Day columns */}
      {days.map((day) => {
        const dayEvents = eventsForDay(events, day);
        const todayClass = isToday(day) ? styles.dayColumnToday : '';

        return (
          <div key={day.toISOString()} className={`${styles.dayColumn} ${todayClass}`}>
            <div className={styles.dayColumnHeader} aria-label={formatDayHeader(day)}>
              {formatDayHeader(day)}
            </div>
            <div className={styles.dayColumnBody}>
              {HOURS.map((hour) => {
                const slotDate = new Date(day);
                slotDate.setHours(hour, 0, 0, 0);
                return (
                  <div
                    key={hour}
                    className={styles.hourSlot}
                    onClick={() => onTimeSlotClick(slotDate)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Create event at ${formatHour(hour)} on ${formatDayHeader(day)}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onTimeSlotClick(slotDate);
                      }
                    }}
                  />
                );
              })}

              {dayEvents.map((ev) => {
                const pos = eventDayPosition(
                  new Date(ev.startAt),
                  ev.endAt ? new Date(ev.endAt) : null,
                  day,
                );
                if (!pos) return null;
                return (
                  <EventBlock
                    key={ev.id}
                    event={ev}
                    onClick={onEventClick}
                    style={{
                      position: 'absolute',
                      top: `${pos.top}%`,
                      height: `${pos.height}%`,
                      left: '0.25rem',
                      right: '0.25rem',
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
