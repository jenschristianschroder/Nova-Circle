/**
 * Button — accessible, token-driven button component.
 *
 * Variants: primary (accent fill), secondary (outlined), danger (destructive)
 * Sizes: sm, md, lg
 *
 * No colour values are hardcoded. All colours are resolved via CSS custom
 * properties defined by ThemeProvider.
 */

import { type ButtonHTMLAttributes, forwardRef } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** When true, the button takes the full width of its container */
  fullWidth?: boolean;
  /** Accessible label when the visible label is not descriptive enough */
  'aria-label'?: string;
}

/**
 * Button component.
 *
 * @example
 * <Button variant="primary" onClick={handleSave}>Save event</Button>
 * <Button variant="danger" aria-label="Delete event 'BBQ Saturday'">Delete</Button>
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth = false, className, children, ...rest },
  ref,
) {
  const classNames = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button ref={ref} className={classNames} {...rest}>
      {children}
    </button>
  );
});
