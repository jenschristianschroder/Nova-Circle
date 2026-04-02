/**
 * Label — form field label with consistent styling.
 */

import { type LabelHTMLAttributes } from 'react';
import { cn } from './cn';

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ className, children, ...rest }: LabelProps) {
  return (
    <label className={cn('text-nc-sm font-medium text-nc-content-secondary', className)} {...rest}>
      {children}
    </label>
  );
}
