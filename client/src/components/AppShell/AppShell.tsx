/**
 * AppShell — persistent navigation chrome rendered around authenticated routes.
 *
 * Contains the primary nav bar with links to Calendar, Groups, and Profile.
 * The main content area is rendered via <Outlet />.
 */

import { Link, Outlet } from 'react-router-dom';
import styles from './AppShell.module.css';

export function AppShell() {
  return (
    <div className={styles.shell}>
      <header className={styles.header} role="banner">
        <div className={styles.headerInner}>
          <Link to="/groups" className={styles.brand} aria-label="Nova-Circle home">
            <span className={styles.brandIcon} aria-hidden="true">
              ◎
            </span>
            <span className={styles.brandName}>Nova-Circle</span>
          </Link>

          <nav aria-label="Primary navigation">
            <ul className={styles.navList}>
              <li>
                <Link to="/calendar" className={styles.navLink}>
                  Calendar
                </Link>
              </li>
              <li>
                <Link to="/groups" className={styles.navLink}>
                  Groups
                </Link>
              </li>
              <li>
                <Link to="/profile" className={styles.navLink}>
                  Profile
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
