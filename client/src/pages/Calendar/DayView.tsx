/**
 * DayView — renders a single day (or custom multi-day) with hourly time slots.
 *
 * Events are positioned vertically based on their start/end time.
 * Overlapping events are not specially arranged and may visually overlap.
 */

import { type CalendarDisplayEvent } from './Calendar';
import { EventBlock } from './EventBlock';
import {
  HOURS,
  formatHour,
  formatDayHeader,
  eventDayPosition,
  addDays,
  startOfDay,
  isToday,
} from '../../utils/calendar-dates';
import styles from './Calendar.module.css';

interface DayViewProps {
  events: CalendarDisplayEvent[];
  anchor: Date;
  onEventClick: (event: CalendarDisplayEvent) => void;
  onTimeSlotClick: (date: Date) => void;
  callerUserId?: string;
  /** For custom multi-day view — number of columns. */
  customDays?: number;
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

function DayColumn({
  day,
  events,
  onEventClick,
  onTimeSlotClick,
  showHeader,
}: {
  day: Date;
  events: CalendarDisplayEvent[];
  onEventClick: (event: CalendarDisplayEvent) => void;
  onTimeSlotClick: (date: Date) => void;
  showHeader: boolean;
}) {
  const dayEvents = eventsForDay(events, day);
  const todayClass = isToday(day) ? styles.dayColumnToday : '';

  return (
    <div className={`${styles.dayColumn} ${todayClass}`}>
      {showHeader && (
        <div className={styles.dayColumnHeader} aria-label={formatDayHeader(day)}>
          {formatDayHeader(day)}
        </div>
      )}
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

        {/* Positioned events */}
        {dayEvents.map((ev) => {
          const pos = eventDayPosition(new Date(ev.startAt), ev.endAt ? new Date(ev.endAt) : null, day);
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
}

export function DayView({
  events,
  anchor,
  onEventClick,
  onTimeSlotClick,
  customDays,
}: DayViewProps) {
  const numDays = customDays ?? 1;
  const days = Array.from({ length: numDays }, (_, i) => addDays(anchor, i));

  return (
    <div className={styles.dayViewContainer} role="grid" aria-label="Day view">
      {/* Time gutter */}
      <div className={styles.timeGutter}>
        {numDays > 1 && <div className={styles.dayColumnHeader}>&nbsp;</div>}
        {HOURS.map((hour) => (
          <div key={hour} className={styles.timeGutterLabel}>
            {formatHour(hour)}
          </div>
        ))}
      </div>

      {/* Day columns */}
      {days.map((day) => (
        <DayColumn
          key={day.toISOString()}
          day={day}
          events={events}
          onEventClick={onEventClick}
          onTimeSlotClick={onTimeSlotClick}
          showHeader={numDays > 1}
        />
      ))}
    </div>
  );
}
