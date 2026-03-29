/**
 * Tests for the Calendar page.
 *
 * Verifies calendar page rendering, view mode switching, navigation,
 * event rendering by visibility level, and localStorage persistence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    startAt: new Date().toISOString(),
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
      startAt: new Date().toISOString(),
      endAt: null,
      status: 'scheduled',
      visibilityLevel: 'details' as const,
      description: 'Weekly standup',
    },
    {
      id: 'se2',
      ownerId: 'u3',
      ownerDisplayName: 'Bob',
      startAt: new Date().toISOString(),
      endAt: null,
      visibilityLevel: 'busy' as const,
    },
  ],
  total: 2,
  page: 1,
  limit: 100,
};

function mockAllData(
  groups = sampleGroups,
  personal = samplePersonalEvents,
  shared = sampleSharedEvents,
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
  mockApiFetch.mockReset();
  mockNavigate.mockReset();
  localStorage.clear();
  sessionStorage.clear();
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
      expect(monthRadio).toHaveAttribute('aria-checked', 'true');
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
      expect(screen.getByRole('radio', { name: 'Day' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
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
      expect(screen.getByRole('radio', { name: 'Week' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
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
      expect(screen.getByRole('radio', { name: 'Day' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
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
});
