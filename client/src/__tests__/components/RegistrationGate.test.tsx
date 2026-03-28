/**
 * Tests for the RegistrationGate component.
 *
 * Verifies the three rendering states:
 *  - loading   → shows a loading indicator while checking registration
 *  - unregistered → redirects to /signup
 *  - registered   → renders children
 *  - error        → shows error message
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { RegistrationGate } from '../../components/RegistrationGate';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    account: { name: 'Test User' },
    getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

const mockApiFetch = vi.fn();

vi.mock('../../api/client', () => ({
  useApiClient: () => ({ apiFetch: mockApiFetch }),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderGate(children: React.ReactNode) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route path="/signup" element={<div>Sign up page</div>} />
          <Route
            path="/app"
            element={<RegistrationGate>{children}</RegistrationGate>}
          />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockApiFetch.mockReset();
  localStorage.clear();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.style.cssText = '';
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('RegistrationGate — loading state', () => {
  it('shows a loading indicator while checking registration', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {})); // never resolves
    renderGate(<div>Protected content</div>);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('marks the loading region as busy for screen readers', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderGate(<div>Protected content</div>);
    const loadingContainer = document.querySelector('[aria-busy="true"][aria-live="polite"]');
    expect(loadingContainer).not.toBeNull();
  });
});

describe('RegistrationGate — registered state', () => {
  it('renders children when the user is registered', async () => {
    mockApiFetch.mockResolvedValue({
      id: 'u1',
      displayName: 'Alice',
      avatarUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    renderGate(<div>Protected content</div>);
    await waitFor(() => expect(screen.getByText('Protected content')).toBeInTheDocument());
  });
});

describe('RegistrationGate — unregistered state', () => {
  it('redirects to /signup when the profile returns 404', async () => {
    // The component checks `err instanceof ApiError` using the mocked class.
    // We need to import the mocked ApiError to create an instance of it.
    const { ApiError } = await import('../../api/client');
    mockApiFetch.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Not found'));
    renderGate(<div>Protected content</div>);
    await waitFor(() => expect(screen.getByText('Sign up page')).toBeInTheDocument());
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});

describe('RegistrationGate — error state', () => {
  it('shows an error message when the API call fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    renderGate(<div>Protected content</div>);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i),
    );
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
