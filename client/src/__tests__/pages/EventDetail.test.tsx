/**
 * Tests for the EventDetail page.
 *
 * Verifies that event information and RSVP controls are rendered correctly,
 * that RSVP calls the API, and that the error states are handled.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { EventDetail } from '../../pages/EventDetail';

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
    account: { name: 'Test User', localAccountId: 'u1' },
    getAccessToken: vi.fn().mockResolvedValue('mock-token'),
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleEvent = {
  id: 'e1',
  groupId: 'g1',
  ownerId: 'u1',
  title: 'Summer BBQ',
  description: 'Come and bring a dish!',
  startAt: '2026-07-04T15:00:00Z',
  endAt: '2026-07-04T20:00:00Z',
  status: 'scheduled',
  createdBy: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const sampleInvitations = [
  {
    id: 'inv1',
    eventId: 'e1',
    userId: 'u1',
    status: 'accepted',
    invitedAt: '2026-01-01T00:00:00Z',
    respondedAt: null,
  },
  {
    id: 'inv2',
    eventId: 'e1',
    userId: 'u2',
    status: 'invited',
    invitedAt: '2026-01-01T00:00:00Z',
    respondedAt: null,
  },
];

function renderEventDetail(groupId = 'g1', eventId = 'e1') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[`/groups/${groupId}/events/${eventId}`]}>
        <Routes>
          <Route path="/groups/:groupId/events/:eventId" element={<EventDetail />} />
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

describe('EventDetail', () => {
  it('shows loading state initially', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderEventDetail();
    expect(screen.getByText(/loading event/i)).toBeInTheDocument();
  });

  it('renders event title as heading', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleEvent).mockResolvedValueOnce(sampleInvitations);
    renderEventDetail();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Summer BBQ' })).toBeInTheDocument(),
    );
  });

  it('renders the event description', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleEvent).mockResolvedValueOnce(sampleInvitations);
    renderEventDetail();
    await waitFor(() => expect(screen.getByText('Come and bring a dish!')).toBeInTheDocument());
  });

  it('renders RSVP buttons for scheduled events', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleEvent).mockResolvedValueOnce(sampleInvitations);
    renderEventDetail();
    await waitFor(() => screen.getByRole('heading', { name: 'Summer BBQ' }));
    expect(screen.getByRole('button', { name: 'Going' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maybe' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not going' })).toBeInTheDocument();
  });

  it('does not render RSVP buttons for cancelled events', async () => {
    const cancelledEvent = { ...sampleEvent, status: 'cancelled' };
    mockApiFetch.mockResolvedValueOnce(cancelledEvent).mockResolvedValueOnce([]);
    renderEventDetail();
    await waitFor(() => screen.getByRole('heading', { name: 'Summer BBQ' }));
    expect(screen.queryByRole('button', { name: /going/i })).not.toBeInTheDocument();
  });

  it('shows the cancelled badge for cancelled events', async () => {
    const cancelledEvent = { ...sampleEvent, status: 'cancelled' };
    mockApiFetch.mockResolvedValueOnce(cancelledEvent).mockResolvedValueOnce([]);
    renderEventDetail();
    await waitFor(() => screen.getByText('Cancelled'));
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('calls rsvp API when "Maybe" is clicked', async () => {
    const user = userEvent.setup();
    const updatedInvitation = { ...sampleInvitations[0], status: 'tentative' };
    mockApiFetch
      .mockResolvedValueOnce(sampleEvent)
      .mockResolvedValueOnce(sampleInvitations)
      .mockResolvedValueOnce(updatedInvitation); // RSVP call

    renderEventDetail();
    await waitFor(() => screen.getByRole('button', { name: 'Maybe' }));
    await user.click(screen.getByRole('button', { name: 'Maybe' }));

    // Three API calls: getEvent, listEventInvitations, rsvpEvent (no shares call for group events)
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
  });

  it('renders attendee list with member identifiers', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleEvent).mockResolvedValueOnce(sampleInvitations);
    renderEventDetail();
    await waitFor(() => screen.getByRole('heading', { name: /attendees/i }));
    // Attendees display as "Member (userId…)" since backend doesn't return displayName
    expect(screen.getByTitle('u1')).toBeInTheDocument();
    expect(screen.getByTitle('u2')).toBeInTheDocument();
  });

  it('shows error state when event loading fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));
    renderEventDetail();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to load event/i),
    );
  });

  it('renders a breadcrumb with links', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleEvent).mockResolvedValueOnce(sampleInvitations);
    renderEventDetail();
    await waitFor(() => screen.getByRole('navigation', { name: /breadcrumb/i }));
    expect(screen.getByRole('link', { name: /groups/i })).toBeInTheDocument();
  });

  it('does not render Share button for group-scoped events', async () => {
    mockApiFetch.mockResolvedValueOnce(sampleEvent).mockResolvedValueOnce(sampleInvitations);
    renderEventDetail();
    await waitFor(() => screen.getByRole('heading', { name: 'Summer BBQ' }));
    expect(
      screen.queryByRole('button', { name: /share event to groups/i }),
    ).not.toBeInTheDocument();
  });

  it('renders Share button for personal event owner', async () => {
    const personalEvent = { ...sampleEvent, groupId: null, ownerId: 'u1' };
    const emptyShares = { shares: [] };
    mockApiFetch
      .mockResolvedValueOnce(personalEvent)
      .mockResolvedValueOnce(sampleInvitations)
      .mockResolvedValueOnce(emptyShares);
    renderEventDetail();
    await waitFor(() => screen.getByRole('heading', { name: 'Summer BBQ' }));
    expect(screen.getByRole('button', { name: /share event to groups/i })).toBeInTheDocument();
  });

  it('does not render Share button for personal event non-owner', async () => {
    const personalEvent = { ...sampleEvent, groupId: null, ownerId: 'other-user' };
    mockApiFetch.mockResolvedValueOnce(personalEvent).mockResolvedValueOnce(sampleInvitations);
    renderEventDetail();
    await waitFor(() => screen.getByRole('heading', { name: 'Summer BBQ' }));
    expect(
      screen.queryByRole('button', { name: /share event to groups/i }),
    ).not.toBeInTheDocument();
  });

  it('shows share count for personal event owner', async () => {
    const personalEvent = { ...sampleEvent, groupId: null, ownerId: 'u1' };
    const sharesResponse = {
      shares: [
        {
          id: 's1',
          eventId: 'e1',
          groupId: 'g1',
          visibilityLevel: 'title',
          sharedByUserId: 'u1',
          sharedAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };
    mockApiFetch
      .mockResolvedValueOnce(personalEvent)
      .mockResolvedValueOnce(sampleInvitations)
      .mockResolvedValueOnce(sharesResponse);
    renderEventDetail();
    await waitFor(() => screen.getByRole('heading', { name: 'Summer BBQ' }));
    expect(screen.getByRole('button', { name: /share event to groups/i })).toHaveTextContent(
      'Share (1)',
    );
  });
});
