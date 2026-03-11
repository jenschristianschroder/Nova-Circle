/**
 * ThemeSwitcher — accessible control for switching between light, dark,
 * and system colour scheme modes, and selecting a colour palette.
 */

import { useTheme } from '../../design-system/ThemeContext';
import { ALL_PALETTES } from '../../design-system/palettes';
import { type Mode } from '../../design-system/themes';
import styles from './ThemeSwitcher.module.css';

const MODE_OPTIONS: { value: Mode; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'system', label: 'System', icon: '💻' },
];

export function ThemeSwitcher() {
  const { mode, paletteId, setMode, setPaletteId } = useTheme();

  return (
    <div className={styles.container} role="group" aria-label="Appearance settings">
      {/* Mode switcher */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Colour mode</legend>
        <div className={styles.modeButtons} role="radiogroup" aria-label="Colour mode">
          {MODE_OPTIONS.map((option) => (
            <label key={option.value} className={styles.modeLabel}>
              <input
                type="radio"
                name="theme-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className={styles.hiddenRadio}
              />
              <span
                className={[styles.modeButton, mode === option.value ? styles.modeButtonActive : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className={styles.modeIcon} aria-hidden="true">
                  {option.icon}
                </span>
                <span>{option.label}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Palette switcher */}
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Colour palette</legend>
        <div className={styles.paletteSwatches} role="radiogroup" aria-label="Colour palette">
          {ALL_PALETTES.map((palette) => (
            <label key={palette.id} title={`${palette.label} – ${palette.description}`}>
              <input
                type="radio"
                name="palette"
                value={palette.id}
                checked={paletteId === palette.id}
                onChange={() => setPaletteId(palette.id)}
                className={styles.hiddenRadio}
                aria-label={`${palette.label} palette – ${palette.description}`}
              />
              <span
                className={[
                  styles.paletteSwatch,
                  paletteId === palette.id ? styles.paletteSwatchActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  {
                    '--swatch-accent': palette.accent[3],
                    '--swatch-accent-light': palette.accent[0],
                  } as React.CSSProperties
                }
                aria-hidden="true"
              />
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
