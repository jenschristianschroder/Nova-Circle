/**
 * Tests for the EventCreate page.
 *
 * Verifies that both the structured form and the text-capture modes work
 * correctly, including validation, success navigation, error handling, and
 * capture issue rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { EventCreate } from '../../pages/EventCreate';

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

const sampleEvent = {
  id: 'e1',
  groupId: 'g1',
  title: 'Team Lunch',
  description: null,
  startAt: '2026-08-01T12:00:00Z',
  endAt: null,
  status: 'scheduled',
  createdBy: 'u1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderEventCreate(groupId = 'g1') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[`/groups/${groupId}/events/new`]}>
        <Routes>
          <Route path="/groups/:groupId/events/new" element={<EventCreate />} />
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

describe('EventCreate', () => {
  it('renders the page heading', () => {
    renderEventCreate();
    expect(screen.getByRole('heading', { name: /create event/i })).toBeInTheDocument();
  });

  it('renders two mode tabs', () => {
    renderEventCreate();
    expect(screen.getByRole('tab', { name: /structured form/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /describe in text/i })).toBeInTheDocument();
  });

  it('renders the structured form by default', () => {
    renderEventCreate();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
  });

  it('switches to capture mode when "Describe in text" tab is clicked', async () => {
    const user = userEvent.setup();
    renderEventCreate();
    await user.click(screen.getByRole('tab', { name: /describe in text/i }));
    expect(screen.getByLabelText(/event description/i)).toBeInTheDocument();
  });

  it('Create event button is disabled when title is empty', () => {
    renderEventCreate();
    expect(screen.getByRole('button', { name: /create event/i })).toBeDisabled();
  });

  it('navigates to event detail on successful form submission', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(sampleEvent);
    renderEventCreate();

    await user.type(screen.getByLabelText(/title/i), 'Team Lunch');
    await user.type(screen.getByLabelText(/start date/i), '2026-08-01T12:00');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/groups/g1/events/e1'));
  });

  it('shows error message when form submission fails', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValueOnce(new Error('Network error'));
    renderEventCreate();

    await user.type(screen.getByLabelText(/title/i), 'Team Lunch');
    await user.type(screen.getByLabelText(/start date/i), '2026-08-01T12:00');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to create event/i),
    );
  });

  it('navigates to event detail on successful text capture', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce({ type: 'event', eventId: 'e1' });
    renderEventCreate();

    await user.click(screen.getByRole('tab', { name: /describe in text/i }));
    await user.type(
      screen.getByLabelText(/event description/i),
      'BBQ at our place on Saturday 14 June at 3pm',
    );
    await user.click(screen.getByRole('button', { name: /create from text/i }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/groups/g1/events/e1'));
  });

  it('shows capture issues when the capture pipeline returns a draft', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce({
      type: 'draft',
      draft: { id: 'd1' },
      issues: ['missing_start_date', 'missing_title'],
    });
    renderEventCreate();

    await user.click(screen.getByRole('tab', { name: /describe in text/i }));
    await user.type(screen.getByLabelText(/event description/i), 'Something vague');
    await user.click(screen.getByRole('button', { name: /create from text/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/missing start date/i)).toBeInTheDocument();
      expect(screen.getByText(/missing title/i)).toBeInTheDocument();
    });
  });

  it('shows error when capture call fails', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValueOnce(new Error('Network error'));
    renderEventCreate();

    await user.click(screen.getByRole('tab', { name: /describe in text/i }));
    await user.type(screen.getByLabelText(/event description/i), 'BBQ at our place on Saturday');
    await user.click(screen.getByRole('button', { name: /create from text/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/capture failed/i));
  });

  it('renders a breadcrumb with links', () => {
    renderEventCreate();
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /groups/i })).toBeInTheDocument();
  });
});
