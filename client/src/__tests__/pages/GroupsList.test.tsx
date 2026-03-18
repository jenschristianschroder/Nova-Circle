/**
 * Tests for the GroupsList page.
 *
 * Verifies that the authenticated groups list renders correctly, handles
 * loading and error states, allows creating a new group, and navigates
 * to group detail on card click.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { GroupsList } from '../../pages/GroupsList';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const sampleGroups = [
  {
    id: 'g1',
    name: 'Family',
    description: 'Our family group',
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'g2',
    name: 'Friends',
    description: null,
    ownerId: 'u1',
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
];

function renderGroupsList() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <GroupsList />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockNavigate.mockReset();
  localStorage.clear();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GroupsList', () => {
  it('shows loading state initially', () => {
    // Never resolves — stays in loading state.
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderGroupsList();
    expect(screen.getByText(/loading groups/i)).toBeInTheDocument();
  });

  it('renders the page heading', async () => {
    mockApiFetch.mockResolvedValue(sampleGroups);
    renderGroupsList();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /my groups/i })).toBeInTheDocument(),
    );
  });

  it('renders a group card for each group', async () => {
    mockApiFetch.mockResolvedValue(sampleGroups);
    renderGroupsList();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open group family/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open group friends/i })).toBeInTheDocument();
    });
  });

  it('shows empty state when no groups exist', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderGroupsList();
    await waitFor(() =>
      expect(screen.getByText(/you are not a member of any groups/i)).toBeInTheDocument(),
    );
  });

  it('shows error state when loading fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    renderGroupsList();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load groups/i),
    );
  });

  it('shows the create form when "+ New Group" is clicked', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(sampleGroups);
    renderGroupsList();
    await waitFor(() => screen.getByRole('heading', { name: /my groups/i }));
    await user.click(screen.getByRole('button', { name: /\+ new group/i }));
    expect(screen.getByRole('heading', { name: /create a new group/i })).toBeInTheDocument();
  });

  it('navigates to group detail when a card is clicked', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(sampleGroups);
    renderGroupsList();
    await waitFor(() => screen.getByRole('button', { name: /open group family/i }));
    await user.click(screen.getByRole('button', { name: /open group family/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/groups/g1');
  });

  it('creates a group and adds it to the list', async () => {
    const user = userEvent.setup();
    const newGroup = {
      id: 'g3',
      name: 'New Group',
      description: null,
      ownerId: 'u1',
      createdAt: '2026-01-03T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
    };
    mockApiFetch
      .mockResolvedValueOnce(sampleGroups) // initial load
      .mockResolvedValueOnce(newGroup); // create

    renderGroupsList();
    await waitFor(() => screen.getByRole('heading', { name: /my groups/i }));

    await user.click(screen.getByRole('button', { name: /\+ new group/i }));
    await user.type(screen.getByLabelText(/name/i), 'New Group');
    await user.click(screen.getByRole('button', { name: /^create group$/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /open group new group/i })).toBeInTheDocument(),
    );
  });
});
