/**
 * Tests for the ProtectedRoute component.
 *
 * Verifies the three rendering states:
 *  - loading   → shows a loading indicator while MSAL resolves auth state
 *  - unauthenticated → redirects to /login
 *  - authenticated   → renders children
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { ProtectedRoute } from '../../components/ProtectedRoute';

// ─── useAuth mock ─────────────────────────────────────────────────────────────

const mockAuthState = {
  isAuthenticated: false,
  isLoading: false,
  account: null,
  getAccessToken: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
};

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Renders ProtectedRoute inside a MemoryRouter so that Navigate and Link work.
 * The /login route renders a simple sentinel so we can assert a redirect.
 */
function renderProtectedRoute(children: React.ReactNode, initialPath = '/protected') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route
            path="/protected"
            element={<ProtectedRoute>{children}</ProtectedRoute>}
          />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  mockAuthState.isAuthenticated = false;
  mockAuthState.isLoading = false;
  mockAuthState.account = null;
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.style.cssText = '';
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProtectedRoute — loading state', () => {
  it('renders a loading indicator while MSAL is resolving', () => {
    mockAuthState.isLoading = true;
    mockAuthState.isAuthenticated = false;

    renderProtectedRoute(<div>Protected content</div>);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('marks the loading region as busy for screen readers', () => {
    mockAuthState.isLoading = true;
    mockAuthState.isAuthenticated = false;

    renderProtectedRoute(<div>Protected content</div>);

    // The loading container sets aria-busy="true" and aria-live="polite".
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('ProtectedRoute — unauthenticated state', () => {
  it('redirects to /login when the user is not authenticated', () => {
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = false;

    renderProtectedRoute(<div>Protected content</div>);

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('does not render application data for unauthenticated users', () => {
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = false;

    renderProtectedRoute(<div>Sensitive group data</div>);

    expect(screen.queryByText('Sensitive group data')).not.toBeInTheDocument();
  });
});

describe('ProtectedRoute — authenticated state', () => {
  it('renders children when the user is authenticated', () => {
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = true;

    renderProtectedRoute(<div>Protected content</div>);

    expect(screen.getByText('Protected content')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('does not render the loading indicator when authenticated', () => {
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = true;

    renderProtectedRoute(<div>Protected content</div>);

    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it('renders multiple children when authenticated', () => {
    mockAuthState.isLoading = false;
    mockAuthState.isAuthenticated = true;

    renderProtectedRoute(
      <>
        <h1>Dashboard</h1>
        <p>Welcome back</p>
      </>,
    );

    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
  });
});
