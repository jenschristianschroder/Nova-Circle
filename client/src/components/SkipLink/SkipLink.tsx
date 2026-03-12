/**
 * SkipLink — accessibility skip navigation link.
 * Allows keyboard users to jump directly to the main content area,
 * bypassing repeated navigation.
 */

import styles from './SkipLink.module.css';

interface SkipLinkProps {
  /** The id of the main content element to skip to */
  targetId?: string;
}

export function SkipLink({ targetId = 'main-content' }: SkipLinkProps) {
  return (
    <a href={`#${targetId}`} className={styles.skipLink}>
      Skip to main content
    </a>
  );
}
