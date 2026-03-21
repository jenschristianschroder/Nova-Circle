/**
 * Tests for the GroupDetail page.
 *
 * Verifies that the authenticated group detail page renders group info,
 * shows the event list, handles loading/error states, and navigates
 * to event detail on event card click.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { GroupDetail } from '../../pages/GroupDetail';

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleGroup = {
  id: 'g1',
  name: 'Family',
  description: 'Our family group',
  ownerId: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const sampleEvents = [
  {
    id: 'e1',
    groupId: 'g1',
    title: 'Summer BBQ',
    description: null,
    startAt: '2026-07-04T15:00:00Z',
    endAt: null,
    status: 'scheduled',
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'e2',
    groupId: 'g1',
    title: 'Old Party',
    description: null,
    startAt: '2026-06-01T18:00:00Z',
    endAt: null,
    status: 'cancelled',
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function renderGroupDetail(groupId = 'g1') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[`/groups/${groupId}`]}>
        <Routes>
          <Route path="/groups/:groupId" element={<GroupDetail />} />
        </Routes>
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

describe('GroupDetail', () => {
  it('shows loading state initially', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderGroupDetail();
    expect(screen.getByText(/loading group/i)).toBeInTheDocument();
  });

  it('renders the group name as a heading', async () => {
    mockApiFetch
      .mockResolvedValue(sampleGroup)
      .mockResolvedValueOnce(sampleGroup)
      .mockResolvedValueOnce(sampleEvents);
    renderGroupDetail();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Family' })).toBeInTheDocument(),
    );
  });

  it('renders event cards for each accessible event', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleGroup).mockResolvedValueOnce(sampleEvents);
    renderGroupDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open event summer bbq/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open event old party/i })).toBeInTheDocument();
    });
  });

  it('shows cancelled badge on cancelled events', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleGroup).mockResolvedValueOnce(sampleEvents);
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /open event old party/i }));
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('shows empty state when no events exist', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleGroup).mockResolvedValueOnce([]);
    renderGroupDetail();
    await waitFor(() => expect(screen.getByText(/no events yet/i)).toBeInTheDocument());
  });

  it('shows error state when loading fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    renderGroupDetail();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load group/i),
    );
  });

  it('navigates to event detail when an event card is clicked', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(sampleGroup).mockResolvedValueOnce(sampleEvents);
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /open event summer bbq/i }));
    await user.click(screen.getByRole('button', { name: /open event summer bbq/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/groups/g1/events/e1');
  });

  it('navigates to event creation when "+ New Event" is clicked', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(sampleGroup).mockResolvedValueOnce(sampleEvents);
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /\+ new event/i }));
    await user.click(screen.getByRole('button', { name: /\+ new event/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/groups/g1/events/new');
  });

  it('renders a breadcrumb with a link back to groups', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleGroup).mockResolvedValueOnce(sampleEvents);
    renderGroupDetail();
    await waitFor(() => screen.getByRole('navigation', { name: /breadcrumb/i }));
    expect(screen.getByRole('link', { name: /groups/i })).toBeInTheDocument();
  });
});
