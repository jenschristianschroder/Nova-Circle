/**
 * Badge — small status indicator with semantic colour variants.
 */

import { type HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeVariant = 'default' | 'accent' | 'danger' | 'success';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-nc-surface-subtle text-nc-content-secondary border border-nc-border-default',
  accent: 'bg-nc-accent-subtle text-nc-accent-default',
  danger: 'bg-nc-danger-subtle text-nc-danger-default',
  success: 'bg-nc-success-subtle text-nc-success-default',
};

export function Badge({ variant = 'default', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-nc-sm px-nc-sm py-0.5',
        'text-nc-xs font-semibold leading-tight',
        variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
