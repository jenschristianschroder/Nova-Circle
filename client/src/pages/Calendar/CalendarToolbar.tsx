/**
 * CalendarToolbar — navigation and view-mode controls for the calendar.
 *
 * Contains previous/next buttons, "Today" button, date picker,
 * view mode selector (day/week/month/custom), and custom days input.
 */

import { type ViewMode, formatMonthHeader, formatDayHeader } from '../../utils/calendar-dates';
import { Button } from '../../components/Button';
import styles from './Calendar.module.css';

interface CalendarToolbarProps {
  mode: ViewMode;
  anchor: Date;
  customDays: number;
  onModeChange: (mode: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDateSelect: (date: Date) => void;
  onCustomDaysChange: (days: number) => void;
}

/** Format YYYY-MM-DD using local date parts (avoids UTC off-by-one). */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatToolbarTitle(mode: ViewMode, anchor: Date, customDays: number): string {
  switch (mode) {
    case 'day':
      return formatDayHeader(anchor);
    case 'week': {
      const weekStart = new Date(anchor);
      const day = weekStart.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      weekStart.setDate(weekStart.getDate() + diff);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return `${formatDayHeader(weekStart)} – ${formatDayHeader(weekEnd)}`;
    }
    case 'month':
      return formatMonthHeader(anchor);
    case 'custom':
      return `${customDays}-day view from ${formatDayHeader(anchor)}`;
  }
}

const MODE_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'custom', label: 'Custom' },
];

export function CalendarToolbar({
  mode,
  anchor,
  customDays,
  onModeChange,
  onPrev,
  onNext,
  onToday,
  onDateSelect,
  onCustomDaysChange,
}: CalendarToolbarProps) {
  const title = formatToolbarTitle(mode, anchor, customDays);

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Calendar navigation">
      <div className={styles.toolbarLeft}>
        <Button
          variant="secondary"
          size="sm"
          onClick={onToday}
          aria-label="Go to today"
        >
          Today
        </Button>

        <div className={styles.navButtons}>
          <Button
            variant="secondary"
            size="sm"
            onClick={onPrev}
            aria-label="Previous period"
          >
            ‹
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onNext}
            aria-label="Next period"
          >
            ›
          </Button>
        </div>

        <h2 className={styles.toolbarTitle} aria-live="polite">
          {title}
        </h2>
      </div>

      <div className={styles.toolbarRight}>
        {mode === 'custom' && (
          <label className={styles.customDaysLabel}>
            <span className={styles.customDaysText}>Days:</span>
            <input
              type="number"
              min={1}
              max={90}
              value={customDays}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && v <= 90) onCustomDaysChange(v);
              }}
              className={styles.customDaysInput}
              aria-label="Number of days to display"
            />
          </label>
        )}

        <input
          type="date"
          value={toLocalDateString(anchor)}
          onChange={(e) => {
            const d = new Date(e.target.value + 'T00:00:00');
            if (!isNaN(d.getTime())) onDateSelect(d);
          }}
          className={styles.datePicker}
          aria-label="Jump to date"
        />

        <div className={styles.modeSelector} role="radiogroup" aria-label="View mode">
          {MODE_OPTIONS.map(({ value, label }) => (
            <label key={value} className={styles.modeLabel}>
              <input
                type="radio"
                name="calendar-view-mode"
                value={value}
                checked={mode === value}
                onChange={() => onModeChange(value)}
                className={styles.hiddenRadio}
              />
              <span
                className={`${styles.modeButton} ${mode === value ? styles.modeButtonActive : ''}`}
              >
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
