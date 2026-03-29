/**
 * GroupFilterPanel — sidebar / dropdown that lets the user toggle
 * which groups' events (and personal events) appear in the calendar.
 *
 * Each group row shows a colour swatch, group name, and a checkbox toggle.
 * Includes "Select all" / "Deselect all" convenience links and a
 * "Personal events" toggle.
 */

import { type Group } from '../../api/groups';
import {
  groupColorVar,
  PERSONAL_COLOR_VAR,
  type buildGroupColorMap,
} from '../../utils/group-colors';
import styles from './Calendar.module.css';

interface GroupFilterPanelProps {
  groups: Group[];
  groupColorMap: ReturnType<typeof buildGroupColorMap>;
  showPersonal: boolean;
  isGroupVisible: (groupId: string) => boolean;
  onTogglePersonal: () => void;
  onToggleGroup: (groupId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function GroupFilterPanel({
  groups,
  groupColorMap,
  showPersonal,
  isGroupVisible,
  onTogglePersonal,
  onToggleGroup,
  onSelectAll,
  onDeselectAll,
}: GroupFilterPanelProps) {
  return (
    <aside className={styles.filterPanel} aria-label="Calendar filter">
      <div className={styles.filterHeader}>
        <span className={styles.filterHeading}>Filter</span>
        <span className={styles.filterActions}>
          <button type="button" className={styles.filterActionLink} onClick={onSelectAll}>
            All
          </button>
          <span aria-hidden="true">|</span>
          <button type="button" className={styles.filterActionLink} onClick={onDeselectAll}>
            None
          </button>
        </span>
      </div>

      <ul className={styles.filterList} role="list">
        {/* Personal events row */}
        <li className={styles.filterRow}>
          <label className={styles.filterLabel}>
            <input
              type="checkbox"
              checked={showPersonal}
              onChange={onTogglePersonal}
              className={styles.filterCheckbox}
            />
            <span
              className={styles.filterSwatch}
              style={{ backgroundColor: `var(${PERSONAL_COLOR_VAR})` }}
              aria-hidden="true"
            />
            <span>Personal events</span>
          </label>
        </li>

        {/* Group rows */}
        {groups.map((group) => {
          const slot = groupColorMap.get(group.id) ?? 0;
          const colorVar = groupColorVar(slot);
          return (
            <li key={group.id} className={styles.filterRow}>
              <label className={styles.filterLabel}>
                <input
                  type="checkbox"
                  checked={isGroupVisible(group.id)}
                  onChange={() => onToggleGroup(group.id)}
                  className={styles.filterCheckbox}
                />
                <span
                  className={styles.filterSwatch}
                  style={{ backgroundColor: `var(${colorVar})` }}
                  aria-hidden="true"
                />
                <span>{group.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
