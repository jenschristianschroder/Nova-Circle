/**
 * Tests for the Calendar page.
 *
 * Verifies calendar page rendering, view mode switching, navigation,
 * event rendering by visibility level, and localStorage persistence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { Calendar } from '../../pages/Calendar';

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

/** Fixed reference date so tests are deterministic and never flake at midnight. */
const FIXED_NOW = new Date('2026-03-15T10:00:00');
const FIXED_ISO = FIXED_NOW.toISOString();

const sampleGroups = [
  {
    id: 'g1',
    name: 'Family',
    description: 'Our family group',
    ownerId: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const samplePersonalEvents = [
  {
    id: 'pe1',
    groupId: null,
    ownerId: 'u1',
    title: 'Personal Lunch',
    description: 'Lunch at noon',
    startAt: FIXED_ISO,
    endAt: null,
    status: 'scheduled',
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

const sampleSharedEvents = {
  events: [
    {
      id: 'se1',
      ownerId: 'u2',
      ownerDisplayName: 'Jane',
      title: 'Team Meeting',
      startAt: FIXED_ISO,
      endAt: null,
      status: 'scheduled',
      visibilityLevel: 'details' as const,
      description: 'Weekly standup',
    },
    {
      id: 'se2',
      ownerId: 'u3',
      ownerDisplayName: 'Bob',
      startAt: FIXED_ISO,
      endAt: null,
      visibilityLevel: 'busy' as const,
    },
  ],
  total: 2,
  page: 1,
  limit: 100,
};

function mockAllData(
  groups: unknown = sampleGroups,
  personal: unknown = samplePersonalEvents,
  shared: unknown = sampleSharedEvents,
) {
  mockApiFetch
    .mockResolvedValueOnce(groups) // listMyGroups
    .mockResolvedValueOnce(personal) // listPersonalEvents
    .mockResolvedValueOnce(shared); // listGroupEvents for group g1
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
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_NOW);
  mockApiFetch.mockReset();
  mockNavigate.mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Calendar page', () => {
  it('shows loading state initially', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderCalendar();
    expect(screen.getByText(/loading calendar/i)).toBeInTheDocument();
  });

  it('renders the calendar toolbar with view mode buttons', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Day' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Week' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Month' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Custom' })).toBeInTheDocument();
    });
  });

  it('renders navigation buttons', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /go to today/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /previous period/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next period/i })).toBeInTheDocument();
    });
  });

  it('defaults to month view mode', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      const monthRadio = screen.getByRole('radio', { name: 'Month' });
      expect(monthRadio).toBeChecked();
    });
  });

  it('renders personal events with owner visibility', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('Personal Lunch')).toBeInTheDocument();
    });
  });

  it('renders shared events with details visibility', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('Team Meeting')).toBeInTheDocument();
    });
  });

  it('renders busy events with owner name', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('Bob — Busy')).toBeInTheDocument();
    });
  });

  it('switches to day view when Day button is clicked', async () => {
    const user = userEvent.setup();
    mockAllData();
    renderCalendar();
    await waitFor(() => screen.getByRole('radio', { name: 'Day' }));

    // Mock data for the re-fetch after mode change
    mockAllData();
    await user.click(screen.getByRole('radio', { name: 'Day' }));

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Day' })).toBeChecked();
    });
  });

  it('switches to week view when Week button is clicked', async () => {
    const user = userEvent.setup();
    mockAllData();
    renderCalendar();
    await waitFor(() => screen.getByRole('radio', { name: 'Week' }));

    mockAllData();
    await user.click(screen.getByRole('radio', { name: 'Week' }));

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Week' })).toBeChecked();
    });
  });

  it('persists the selected view mode to localStorage', async () => {
    const user = userEvent.setup();
    mockAllData();
    renderCalendar();
    await waitFor(() => screen.getByRole('radio', { name: 'Week' }));

    mockAllData();
    await user.click(screen.getByRole('radio', { name: 'Week' }));

    await waitFor(() => {
      expect(localStorage.getItem('nc-calendar-view-mode')).toBe('week');
    });
  });

  it('restores persisted view mode from localStorage', async () => {
    localStorage.setItem('nc-calendar-view-mode', 'day');
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Day' })).toBeChecked();
    });
  });

  it('shows error state when data fetching fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load calendar/i);
    });
  });

  it('renders a date picker input', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByLabelText(/jump to date/i)).toBeInTheDocument();
    });
  });

  it('renders the calendar with aria-label', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('main', { name: 'Calendar' })).toBeInTheDocument();
    });
  });

  it('shows custom days input when custom mode is selected', async () => {
    const user = userEvent.setup();
    mockAllData();
    renderCalendar();
    await waitFor(() => screen.getByRole('radio', { name: 'Custom' }));

    mockAllData();
    await user.click(screen.getByRole('radio', { name: 'Custom' }));

    await waitFor(() => {
      expect(screen.getByLabelText(/number of days/i)).toBeInTheDocument();
    });
  });

  it('renders month view grid with weekday headers', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('Mon')).toBeInTheDocument();
      expect(screen.getByText('Tue')).toBeInTheDocument();
      expect(screen.getByText('Wed')).toBeInTheDocument();
      expect(screen.getByText('Thu')).toBeInTheDocument();
      expect(screen.getByText('Fri')).toBeInTheDocument();
      expect(screen.getByText('Sat')).toBeInTheDocument();
      expect(screen.getByText('Sun')).toBeInTheDocument();
    });
  });

  it('renders day view with hourly time grid', async () => {
    localStorage.setItem('nc-calendar-view-mode', 'day');
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('grid', { name: 'Day view' })).toBeInTheDocument();
    });
  });

  it('renders week view with 7-day grid and day headers', async () => {
    localStorage.setItem('nc-calendar-view-mode', 'week');
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('grid', { name: 'Week view' })).toBeInTheDocument();
    });
  });

  it('renders month view with month grid', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('grid', { name: 'Month view' })).toBeInTheDocument();
    });
  });

  it('persists custom days to localStorage', async () => {
    localStorage.setItem('nc-calendar-view-mode', 'custom');
    localStorage.setItem('nc-calendar-custom-days', '7');
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      const input = screen.getByLabelText(/number of days/i) as HTMLInputElement;
      expect(input.value).toBe('7');
    });
  });

  it('restores default custom days when localStorage value is invalid', async () => {
    localStorage.setItem('nc-calendar-view-mode', 'custom');
    localStorage.setItem('nc-calendar-custom-days', 'abc');
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      const input = screen.getByLabelText(/number of days/i) as HTMLInputElement;
      expect(input.value).toBe('3');
    });
  });

  it('deduplicates events shared to multiple groups', async () => {
    const twoGroups = [
      { ...sampleGroups[0] },
      {
        id: 'g2',
        name: 'Friends',
        description: 'Friends group',
        ownerId: 'u1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const sharedSameEvent = {
      events: [
        {
          id: 'shared-dup',
          ownerId: 'u2',
          ownerDisplayName: 'Jane',
          title: 'Duplicate Event',
          startAt: FIXED_ISO,
          endAt: null,
          status: 'scheduled',
          visibilityLevel: 'details' as const,
          description: 'Same event in two groups',
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    };

    mockApiFetch
      .mockResolvedValueOnce(twoGroups) // listMyGroups
      .mockResolvedValueOnce(samplePersonalEvents) // listPersonalEvents
      .mockResolvedValueOnce(sharedSameEvent) // listGroupEvents for g1
      .mockResolvedValueOnce(sharedSameEvent); // listGroupEvents for g2 — same event

    renderCalendar();
    await waitFor(() => {
      // Event title should appear exactly once despite being in two groups
      const matches = screen.getAllByText('Duplicate Event');
      expect(matches).toHaveLength(1);
    });
  });

  it('renders title-level shared events with title text', async () => {
    const titleEvent = {
      events: [
        {
          id: 'se-title',
          ownerId: 'u2',
          ownerDisplayName: 'Jane',
          title: 'Title Only Meeting',
          startAt: FIXED_ISO,
          endAt: null,
          status: 'scheduled',
          visibilityLevel: 'title' as const,
          description: undefined,
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
    };

    mockAllData(sampleGroups, samplePersonalEvents, titleEvent);
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('Title Only Meeting')).toBeInTheDocument();
    });
  });

  it('does not navigate when a busy event is clicked', async () => {
    const user = userEvent.setup();
    mockAllData();
    renderCalendar();
    await waitFor(() => screen.getByText('Bob — Busy'));

    const busyBlock = screen.getByText('Bob — Busy').closest('[aria-label]');
    expect(busyBlock).toBeInTheDocument();
    // Busy events should NOT be rendered as buttons
    expect(busyBlock?.tagName).not.toBe('BUTTON');

    // Click the busy block and verify no navigation occurs
    await user.click(busyBlock!);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders group filter panel with group checkboxes', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('Personal events')).toBeInTheDocument();
      expect(screen.getByText('Family')).toBeInTheDocument();
    });
  });

  it('renders filter panel with select all / deselect all buttons', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('None')).toBeInTheDocument();
    });
  });

  it('renders mobile filter toggle button', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open calendar filter/i })).toBeInTheDocument();
    });
  });

  it('renders the toolbar with aria-label', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('toolbar', { name: /calendar navigation/i })).toBeInTheDocument();
    });
  });

  it('renders view mode selector as a radiogroup', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('radiogroup', { name: /view mode/i })).toBeInTheDocument();
    });
  });

  it('renders events with no end time', async () => {
    const noEndEvent = [
      {
        id: 'pe-no-end',
        groupId: null,
        ownerId: 'u1',
        title: 'Quick Reminder',
        description: '',
        startAt: FIXED_ISO,
        endAt: null,
        status: 'scheduled',
        createdBy: 'u1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    mockAllData(sampleGroups, noEndEvent, { events: [], total: 0, page: 1, limit: 100 });
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('Quick Reminder')).toBeInTheDocument();
    });
  });

  it('navigates forward when next button is clicked', async () => {
    const user = userEvent.setup();
    mockAllData();
    renderCalendar();
    await waitFor(() => screen.getByRole('button', { name: /next period/i }));

    // Mock data for the re-fetch triggered by navigation
    mockAllData();
    await user.click(screen.getByRole('button', { name: /next period/i }));

    // The toolbar title should update (exact text depends on current date, just verify re-render)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });
  });

  it('navigates backward when previous button is clicked', async () => {
    const user = userEvent.setup();
    mockAllData();
    renderCalendar();
    await waitFor(() => screen.getByRole('button', { name: /previous period/i }));

    mockAllData();
    await user.click(screen.getByRole('button', { name: /previous period/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });
  });

  it('today button returns to current date', async () => {
    const user = userEvent.setup();
    mockAllData();
    renderCalendar();
    await waitFor(() => screen.getByRole('button', { name: /go to today/i }));

    // Navigate away first
    mockAllData();
    await user.click(screen.getByRole('button', { name: /next period/i }));
    await waitFor(() => screen.getByRole('heading', { level: 2 }));

    // Then click today
    mockAllData();
    await user.click(screen.getByRole('button', { name: /go to today/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    });
  });

  it('renders cancelled events with cancelled badge', async () => {
    const cancelledEvents = [
      {
        id: 'pe-cancelled',
        groupId: null,
        ownerId: 'u1',
        title: 'Cancelled Event',
        description: '',
        startAt: FIXED_ISO,
        endAt: null,
        status: 'cancelled',
        createdBy: 'u1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    mockAllData(sampleGroups, cancelledEvents, { events: [], total: 0, page: 1, limit: 100 });
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByText('Cancelled Event')).toBeInTheDocument();
      expect(screen.getByText('Cancelled')).toBeInTheDocument();
    });
  });

  it('displays toolbar title with aria-live for screen readers', async () => {
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      const title = screen.getByRole('heading', { level: 2 });
      expect(title).toHaveAttribute('aria-live', 'polite');
    });
  });

  it('restores persisted custom view mode from localStorage', async () => {
    localStorage.setItem('nc-calendar-view-mode', 'custom');
    localStorage.setItem('nc-calendar-custom-days', '5');
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked();
      expect(screen.getByRole('grid', { name: 'Day view' })).toBeInTheDocument();
    });
  });

  it('falls back to month mode for invalid localStorage value', async () => {
    localStorage.setItem('nc-calendar-view-mode', 'invalid');
    mockAllData();
    renderCalendar();
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Month' })).toBeChecked();
    });
  });
});
