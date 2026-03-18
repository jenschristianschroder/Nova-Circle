/**
 * Tests for the Profile page.
 *
 * Verifies that the user's profile is displayed, editing works correctly,
 * and sign-out triggers the logout flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { Profile } from '../../pages/Profile';

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleProfile = {
  id: 'u1',
  displayName: 'Alice',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderProfile() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Profile />
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

describe('Profile', () => {
  it('shows loading state initially', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderProfile();
    expect(screen.getByText(/loading profile/i)).toBeInTheDocument();
  });

  it('renders the page heading', async () => {
    mockApiFetch.mockResolvedValue(sampleProfile);
    renderProfile();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /^profile$/i })).toBeInTheDocument(),
    );
  });

  it('renders the user display name', async () => {
    mockApiFetch.mockResolvedValue(sampleProfile);
    renderProfile();
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
  });

  it('renders the edit button', async () => {
    mockApiFetch.mockResolvedValue(sampleProfile);
    renderProfile();
    await waitFor(() => expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument());
  });

  it('shows the edit form when Edit is clicked', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(sampleProfile);
    renderProfile();
    await waitFor(() => screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
  });

  it('saves the profile when the form is submitted', async () => {
    const user = userEvent.setup();
    const updatedProfile = { ...sampleProfile, displayName: 'Alice Updated' };
    mockApiFetch.mockResolvedValueOnce(sampleProfile).mockResolvedValueOnce(updatedProfile);

    renderProfile();
    await waitFor(() => screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /edit/i }));

    const nameInput = screen.getByLabelText(/display name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Alice Updated');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/profile updated successfully/i),
    );
  });

  it('shows error when loading fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    renderProfile();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load your profile/i),
    );
  });

  it('renders the sign-out button', async () => {
    mockApiFetch.mockResolvedValue(sampleProfile);
    renderProfile();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument(),
    );
  });

  it('calls logout when Sign out is clicked', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(sampleProfile);
    renderProfile();
    await waitFor(() => screen.getByRole('button', { name: /sign out/i }));
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(mockLogout).toHaveBeenCalledOnce();
  });
});
