/**
 * Input — styled text input with design-token integration.
 *
 * Touch-friendly with a 44px minimum height on mobile.
 */

import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from './cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full rounded-nc-sm border border-nc-border-interactive bg-nc-surface-background',
        'px-nc-md py-nc-sm text-nc-md text-nc-content-primary',
        'min-h-[2.75rem]',
        'transition-colors duration-150',
        'placeholder:text-nc-content-disabled',
        'focus:border-nc-accent-default focus:ring-2 focus:ring-nc-accent-subtle focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
});
