/**
 * Avatar — user/group avatar with image or initials fallback.
 *
 * Wraps Radix Avatar for accessible loading states.
 */

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from './cn';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback: string;
  size?: AvatarSize;
  className?: string;
}

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-nc-xs',
  md: 'h-10 w-10 text-nc-sm',
  lg: 'h-16 w-16 text-nc-lg',
};

export function Avatar({ src, alt = '', fallback, size = 'md', className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-nc-full bg-nc-surface-subtle',
        sizeClasses[size],
        className,
      )}
    >
      {src && (
        <AvatarPrimitive.Image src={src} alt={alt} className="h-full w-full object-cover" />
      )}
      <AvatarPrimitive.Fallback
        className="flex h-full w-full items-center justify-center font-medium text-nc-content-secondary"
        delayMs={src ? 600 : 0}
      >
        {fallback}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
