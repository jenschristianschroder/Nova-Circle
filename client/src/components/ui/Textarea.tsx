/**
 * Textarea — styled multi-line input with design-token integration.
 */

import { type TextareaHTMLAttributes, forwardRef } from 'react';
import { cn } from './cn';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-nc-sm border border-nc-border-interactive bg-nc-surface-background',
        'px-nc-md py-nc-sm font-body text-nc-md text-nc-content-primary',
        'resize-y',
        'transition-colors duration-150',
        'placeholder:text-nc-content-disabled',
        'focus:border-nc-accent-default focus:ring-2 focus:ring-nc-accent-subtle focus:outline-none',
        className,
      )}
      {...rest}
    />
  );
});
