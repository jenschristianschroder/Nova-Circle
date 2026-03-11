/**
 * VisuallyHidden — renders children only for assistive technology.
 *
 * Use this to provide accessible labels for elements that have only visual
 * representation (icons, images without alt text, etc.).
 */

import { type ElementType, type ReactNode } from 'react';

interface VisuallyHiddenProps {
  children: ReactNode;
  /** Render as a different element. Defaults to 'span'. */
  as?: ElementType;
}

export function VisuallyHidden({ children, as: Component = 'span' }: VisuallyHiddenProps) {
  return <Component className="sr-only">{children}</Component>;
}
