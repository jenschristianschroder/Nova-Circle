/**
 * Tests for the SignUp page.
 *
 * Verifies that:
 *  - the sign-up form renders with required fields
 *  - successful sign-up navigates to /groups
 *  - validation prevents empty display name submission
 *  - error state is displayed on API failure
 *  - sign-out button triggers logout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { SignUp } from '../../pages/SignUp';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockLogout = vi.fn().mockResolvedValue(undefined);

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    account: { name: 'Test User' },
    getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    login: vi.fn(),
    logout: mockLogout,
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
    }
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderSignUp() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignUp />} />
          <Route path="/groups" element={<div>Groups page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockLogout.mockClear();
  localStorage.clear();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SignUp', () => {
  it('renders the page heading', () => {
    renderSignUp();
    expect(screen.getByRole('heading', { name: /complete your profile/i })).toBeInTheDocument();
  });

  it('renders the display name input', () => {
    renderSignUp();
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
  });

  it('renders the avatar URL input', () => {
    renderSignUp();
    expect(screen.getByLabelText(/avatar url/i)).toBeInTheDocument();
  });

  it('renders the create account button', () => {
    renderSignUp();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('renders the sign-out button', () => {
    renderSignUp();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('disables the submit button when display name is empty', () => {
    renderSignUp();
    const submitButton = screen.getByRole('button', { name: /create account/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables the submit button when display name has content', async () => {
    const user = userEvent.setup();
    renderSignUp();

    await user.type(screen.getByLabelText(/display name/i), 'Alice');
    const submitButton = screen.getByRole('button', { name: /create account/i });
    expect(submitButton).toBeEnabled();
  });

  it('navigates to /groups after successful sign-up', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({
      id: 'u1',
      displayName: 'Alice',
      avatarUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    renderSignUp();
    await user.type(screen.getByLabelText(/display name/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(screen.getByText('Groups page')).toBeInTheDocument());
  });

  it('shows error message when sign-up fails', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    renderSignUp();
    await user.type(screen.getByLabelText(/display name/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to create your account/i),
    );
  });

  it('calls logout when Sign out is clicked', async () => {
    const user = userEvent.setup();
    renderSignUp();
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockLogout).toHaveBeenCalledOnce();
  });

  it('calls the signup API with correct data', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({
      id: 'u1',
      displayName: 'Alice',
      avatarUrl: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });

    renderSignUp();
    await user.type(screen.getByLabelText(/display name/i), 'Alice');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/signup', {
        method: 'POST',
        body: JSON.stringify({ displayName: 'Alice', avatarUrl: null }),
      });
    });
  });
});
