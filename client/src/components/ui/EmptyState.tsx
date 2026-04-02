/**
 * EmptyState — placeholder for empty lists/sections.
 *
 * Displays a Lucide icon, heading, description, and optional action.
 */

import { type ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-nc-md rounded-nc-md',
        'border border-dashed border-nc-border-default bg-nc-surface-card',
        'px-nc-lg py-nc-2xl text-center',
        className,
      )}
    >
      {icon && <div className="text-nc-content-disabled">{icon}</div>}
      <h3 className="text-nc-md font-semibold text-nc-content-primary">{title}</h3>
      {description && (
        <p className="max-w-xs text-nc-sm text-nc-content-secondary">{description}</p>
      )}
      {action && <div className="mt-nc-sm">{action}</div>}
    </div>
  );
}
