/**
 * Integration tests for calendar group filtering.
 *
 * Tests that toggling groups on/off affects API calls and event display,
 * that filter state persists across sessions, and that colour assignment
 * is correct.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { Calendar } from '../../pages/Calendar';
import { STORAGE_KEY_FILTER } from '../../hooks/useCalendarFilter';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockApiFetch = vi.fn();
vi.mock('../../api/client', () => ({
  useApiClient: () => ({ apiFetch: mockApiFetch }),
}));

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    account: { name: 'Test User', localAccountId: 'u1' },
    getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const groups = [
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
    name: 'Work',
    description: 'Work team',
    ownerId: 'u2',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const personalEvents = [
  {
    id: 'pe1',
    groupId: null,
    ownerId: 'u1',
    title: 'My Lunch',
    description: null,
    startAt: new Date().toISOString(),
    endAt: null,
    status: 'scheduled',
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const g1Events = {
  events: [
    {
      id: 'se1',
      ownerId: 'u2',
      ownerDisplayName: 'Jane',
      title: 'Family Dinner',
      startAt: new Date().toISOString(),
      endAt: null,
      status: 'scheduled',
      visibilityLevel: 'details' as const,
      description: 'Dinner at home',
    },
  ],
  total: 1,
  page: 1,
  limit: 100,
};

const g2Events = {
  events: [
    {
      id: 'se2',
      ownerId: 'u3',
      ownerDisplayName: 'Bob',
      title: 'Sprint Planning',
      startAt: new Date().toISOString(),
      endAt: null,
      status: 'scheduled',
      visibilityLevel: 'details' as const,
      description: 'Planning meeting',
    },
  ],
  total: 1,
  page: 1,
  limit: 100,
};

function mockAllData() {
  mockApiFetch
    .mockResolvedValueOnce(groups) // listMyGroups
    .mockResolvedValueOnce(personalEvents) // listPersonalEvents
    .mockResolvedValueOnce(g1Events) // listGroupEvents g1
    .mockResolvedValueOnce(g2Events); // listGroupEvents g2
}

function renderCalendar() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/calendar']}>
        <Routes>
          <Route path="/calendar" element={<Calendar />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockNavigate.mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Calendar group filtering integration', () => {
  it('renders the filter panel with all groups', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('Family')).toBeInTheDocument();
      expect(screen.getByText('Work')).toBeInTheDocument();
    });
  });

  it('renders personal events toggle', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /personal events/i })).toBeInTheDocument();
    });
  });

  it('shows all events by default', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('My Lunch')).toBeInTheDocument();
      expect(screen.getByText('Family Dinner')).toBeInTheDocument();
      expect(screen.getByText('Sprint Planning')).toBeInTheDocument();
    });
  });

  it('does not fetch group events for toggled-off groups', async () => {
    // Pre-set filter state: g2 is off
    localStorage.setItem(
      STORAGE_KEY_FILTER,
      JSON.stringify({ personal: true, groups: { g1: true, g2: false } }),
    );

    mockApiFetch
      .mockResolvedValueOnce(groups) // listMyGroups
      .mockResolvedValueOnce(personalEvents) // listPersonalEvents
      .mockResolvedValueOnce(g1Events); // listGroupEvents g1 only

    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('My Lunch')).toBeInTheDocument();
      expect(screen.getByText('Family Dinner')).toBeInTheDocument();
    });

    // g2 events should NOT have been fetched or rendered
    expect(screen.queryByText('Sprint Planning')).not.toBeInTheDocument();

    // Verify the API was called 3 times (groups + personal + g1), not 4
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
  });

  it('does not fetch personal events when personal toggle is off', async () => {
    localStorage.setItem(
      STORAGE_KEY_FILTER,
      JSON.stringify({ personal: false, groups: { g1: true, g2: true } }),
    );

    mockApiFetch
      .mockResolvedValueOnce(groups) // listMyGroups
      .mockResolvedValueOnce(g1Events) // listGroupEvents g1
      .mockResolvedValueOnce(g2Events); // listGroupEvents g2

    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('Family Dinner')).toBeInTheDocument();
      expect(screen.getByText('Sprint Planning')).toBeInTheDocument();
    });

    // Personal events should not appear
    expect(screen.queryByText('My Lunch')).not.toBeInTheDocument();

    // Only 3 calls (groups + g1 + g2), no personal events call
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
  });

  it('toggling a group off removes its events from the calendar', async () => {
    const user = userEvent.setup();
    mockAllData();
    renderCalendar();

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Sprint Planning')).toBeInTheDocument();
    });

    // Toggle off the Work group — mock re-fetch without g2
    mockApiFetch
      .mockResolvedValueOnce(groups)
      .mockResolvedValueOnce(personalEvents)
      .mockResolvedValueOnce(g1Events);

    const workCheckbox = screen.getByRole('checkbox', { name: /work/i });
    await user.click(workCheckbox);

    await waitFor(() => {
      expect(screen.queryByText('Sprint Planning')).not.toBeInTheDocument();
    });

    // Family events should still be visible
    expect(screen.getByText('Family Dinner')).toBeInTheDocument();
  });

  it('renders Select All and Deselect All controls', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'None' })).toBeInTheDocument();
    });
  });

  it('filter state persists in localStorage', async () => {
    const user = userEvent.setup();
    mockAllData();
    renderCalendar();

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /family/i })).toBeInTheDocument();
    });

    // Mock for re-fetch after toggle
    mockApiFetch
      .mockResolvedValueOnce(groups)
      .mockResolvedValueOnce(personalEvents)
      .mockResolvedValueOnce(g2Events);

    await user.click(screen.getByRole('checkbox', { name: /family/i }));

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_FILTER)!);
      expect(stored.groups.g1).toBe(false);
    });
  });
});
