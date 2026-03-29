/**
 * EventBlock — renders a single event within a calendar grid cell.
 *
 * Appearance varies by visibility level:
 * - `busy`    → opaque block showing owner name + "Busy", not clickable
 * - `title`   → shows event title and time, not clickable
 * - `details` → shows title, time, preview; clickable to full detail
 * - `owner`   → personal event with full detail; clickable when route exists
 */

import { type CalendarDisplayEvent } from './Calendar';
import { formatTime } from '../../utils/calendar-dates';
import styles from './Calendar.module.css';

interface EventBlockProps {
  event: CalendarDisplayEvent;
  onClick?: (event: CalendarDisplayEvent) => void;
  /** Whether to show the time label. */
  showTime?: boolean;
  /** Inline styles for positioning (top/height in day/week views). */
  style?: React.CSSProperties;
}

export function EventBlock({ event, onClick, showTime = true, style }: EventBlockProps) {
  const isClickable =
    (event.visibilityLevel === 'details' || event.visibilityLevel === 'owner') &&
    event.groupId !== null;
  const startDate = new Date(event.startAt);

  const visClass =
    event.visibilityLevel === 'busy'
      ? styles.eventBusy
      : event.visibilityLevel === 'title'
        ? styles.eventTitle
        : event.visibilityLevel === 'owner'
          ? styles.eventOwner
          : styles.eventDetails;

  const cancelledClass = event.status === 'cancelled' ? styles.eventCancelled : '';

  // Apply group colour as a CSS variable-driven left border + subtle bg tint
  const colorStyle: React.CSSProperties = { ...style };
  if (event.groupColorVar && event.visibilityLevel !== 'busy') {
    colorStyle.borderLeftColor = `var(${event.groupColorVar})`;
  }

  const content = (
    <>
      <span className={styles.eventBlockTitle}>{event.title}</span>
      {showTime && (
        <span className={styles.eventBlockTime}>{formatTime(startDate)}</span>
      )}
      {event.status === 'cancelled' && (
        <span className={styles.eventBlockBadge}>Cancelled</span>
      )}
    </>
  );

  if (isClickable) {
    return (
      <button
        type="button"
        className={`${styles.eventBlock} ${styles.eventBlockClickable} ${visClass} ${cancelledClass}`}
        style={colorStyle}
        onClick={() => onClick?.(event)}
        aria-label={`Open event: ${event.title}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={`${styles.eventBlock} ${visClass} ${cancelledClass}`}
      style={colorStyle}
      aria-label={
        event.visibilityLevel === 'busy'
          ? `${event.ownerDisplayName ?? 'Someone'} is busy`
          : `Event: ${event.title}`
      }
    >
      {content}
    </div>
  );
}
