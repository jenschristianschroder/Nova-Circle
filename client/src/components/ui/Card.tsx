/**
 * Card — surface container with subtle elevation.
 *
 * Uses semantic design tokens for background, border, and shadow.
 * Tailwind utility classes keep the styling composable and maintainable.
 */

import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Remove default padding — useful when children manage their own padding */
  noPadding?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, noPadding, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-nc-md border border-nc-border-default bg-nc-surface-card shadow-nc-sm',
        !noPadding && 'p-nc-lg',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
});
