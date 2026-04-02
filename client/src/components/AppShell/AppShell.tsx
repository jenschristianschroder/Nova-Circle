/**
 * AppShell — persistent navigation chrome rendered around authenticated routes.
 *
 * Mobile-first layout:
 *   - Mobile (default): bottom tab bar + minimal top bar
 *   - Desktop (md+): top horizontal nav bar
 *
 * Uses Lucide icons and Tailwind utility classes with NC design tokens.
 */

import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, Users, UserCircle, LogOut } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { cn } from '../ui/cn';

export function AppShell() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/groups', label: 'Groups', icon: Users },
    { to: '/profile', label: 'Profile', icon: UserCircle },
  ];

  function isActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  return (
    <div className="flex min-h-dvh flex-col bg-nc-surface-background text-nc-content-primary">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header
        role="banner"
        className="sticky top-0 z-50 border-b border-nc-border-default bg-nc-surface-card"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-nc-lg px-nc-md py-nc-sm md:px-nc-lg">
          <Link
            to="/calendar"
            className="flex items-center gap-nc-sm text-nc-content-primary no-underline"
            aria-label="Nova-Circle home"
          >
            <span className="text-2xl text-nc-accent-default" aria-hidden="true">
              ◎
            </span>
            <span className="text-nc-lg font-semibold tracking-tight">Nova-Circle</span>
          </Link>

          {/* Desktop navigation — hidden on mobile */}
          <nav aria-label="Primary navigation" className="ml-auto hidden md:block">
            <ul className="flex items-center gap-nc-xs">
              {navItems.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      'flex items-center gap-nc-xs rounded-nc-sm px-nc-sm py-nc-xs',
                      'text-nc-sm font-medium no-underline transition-colors duration-150',
                      isActive(item.to)
                        ? 'bg-nc-accent-subtle text-nc-accent-default'
                        : 'text-nc-content-secondary hover:bg-nc-surface-subtle hover:text-nc-content-primary',
                    )}
                  >
                    <item.icon size={18} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    void logout().catch(() => navigate('/login'));
                  }}
                  className={cn(
                    'flex items-center gap-nc-xs rounded-nc-sm px-nc-sm py-nc-xs',
                    'cursor-pointer border-none bg-transparent text-nc-sm font-medium',
                    'text-nc-content-secondary transition-colors duration-150',
                    'hover:text-nc-danger-default',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nc-border-focus',
                  )}
                  aria-label="Sign out"
                >
                  <LogOut size={18} aria-hidden="true" />
                  Sign out
                </button>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 pb-[4.5rem] md:pb-0">
        <Outlet />
      </div>

      {/* ── Mobile bottom tab bar — hidden on desktop ────────────────── */}
      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-nc-border-default bg-nc-surface-card md:hidden"
      >
        <ul className="flex items-stretch justify-around">
          {navItems.map((item) => (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-nc-sm no-underline',
                  'min-h-[3.5rem] text-[0.6875rem] font-medium transition-colors duration-150',
                  isActive(item.to)
                    ? 'text-nc-accent-default'
                    : 'text-nc-content-secondary',
                )}
                aria-current={isActive(item.to) ? 'page' : undefined}
              >
                <item.icon size={22} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
