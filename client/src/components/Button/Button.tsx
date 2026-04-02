/**
 * Button — accessible, token-driven button component.
 *
 * Variants: primary (accent fill), secondary (outlined), danger (destructive)
 * Sizes: sm, md, lg
 *
 * Styled with Tailwind utility classes consuming NC design tokens.
 * No colour values are hardcoded.
 */

import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../ui/cn';

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

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'bg-nc-accent-default border-nc-accent-default text-nc-content-on-accent',
    'hover:bg-nc-accent-hover hover:border-nc-accent-hover',
    'active:bg-nc-accent-active active:border-nc-accent-active',
  ].join(' '),
  secondary: [
    'bg-transparent border-nc-border-interactive text-nc-content-primary',
    'hover:bg-nc-surface-subtle',
    'active:bg-nc-surface-subtle active:border-nc-accent-default',
  ].join(' '),
  danger: [
    'bg-nc-danger-default border-nc-danger-default text-nc-content-on-danger',
    'hover:bg-nc-danger-hover hover:border-nc-danger-hover',
  ].join(' '),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'text-[0.8125rem] px-nc-sm py-nc-xs min-h-[2rem]',
  md: 'text-[0.9375rem] px-nc-md py-nc-sm min-h-[2.75rem]',
  lg: 'text-nc-md px-nc-lg py-nc-sm min-h-[3rem]',
};

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
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-nc-xs',
        'rounded-nc-md border-[1.5px] border-transparent font-medium',
        'cursor-pointer whitespace-nowrap no-underline select-none',
        'transition-all duration-[120ms] ease-in-out',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nc-border-focus',
        'disabled:cursor-not-allowed disabled:opacity-40',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
