/**
 * AppShell — persistent navigation chrome rendered around authenticated routes.
 *
 * Contains the primary nav bar with links to Groups and Profile.
 * The main content area is rendered via <Outlet />.
 */

import { Link, Outlet, useNavigate } from 'react-router-dom';
import { ThemeSwitcher } from '../ThemeSwitcher';
import { useAuth } from '../../auth/useAuth';
import styles from './AppShell.module.css';

export function AppShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();

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

          <div className={styles.headerActions}>
            <ThemeSwitcher />
            <button
              type="button"
              className={styles.signOutButton}
              onClick={() => {
                void logout().catch(() => navigate('/login'));
              }}
              aria-label="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
