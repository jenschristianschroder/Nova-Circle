/**
 * IconButton — icon-only button with tooltip.
 *
 * Minimum 44×44px touch target for mobile accessibility.
 */

import { type ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from './cn';

export type IconButtonVariant = 'ghost' | 'outline' | 'danger';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  /** Accessible label (required for icon-only buttons) */
  'aria-label': string;
}

const variantClasses: Record<IconButtonVariant, string> = {
  ghost: 'text-nc-content-secondary hover:bg-nc-surface-subtle hover:text-nc-content-primary',
  outline:
    'border border-nc-border-interactive text-nc-content-secondary hover:bg-nc-surface-subtle hover:text-nc-content-primary',
  danger: 'text-nc-danger-default hover:bg-nc-danger-subtle',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-nc-md',
        'min-h-[2.75rem] min-w-[2.75rem]',
        'cursor-pointer transition-colors duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nc-border-focus',
        'disabled:cursor-not-allowed disabled:opacity-40',
        variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
