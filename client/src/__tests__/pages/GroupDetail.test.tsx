/**
 * Tests for the GroupDetail page.
 *
 * Verifies that the authenticated group detail page renders group info,
 * shows the event list, handles loading/error states, navigates to event
 * detail on event card click, and allows owners and admins to edit the group
 * (with deletion restricted to the owner).
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

const sampleMembers = [{ userId: 'u1', role: 'owner', joinedAt: '2026-01-01T00:00:00Z' }];

const sampleProfile = {
  id: 'u1',
  displayName: 'Test User',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/** Mock all four data calls: group, events, members, profile */
function mockLoadData(
  group = sampleGroup,
  events = sampleEvents,
  members = sampleMembers,
  profile = sampleProfile,
) {
  mockApiFetch
    .mockResolvedValueOnce(group)
    .mockResolvedValueOnce(events)
    .mockResolvedValueOnce(members)
    .mockResolvedValueOnce(profile);
}

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
    mockLoadData();
    renderGroupDetail();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Family' })).toBeInTheDocument(),
    );
  });

  it('renders event cards for each accessible event', async () => {
    mockLoadData();
    renderGroupDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open event summer bbq/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /open event old party/i })).toBeInTheDocument();
    });
  });

  it('shows cancelled badge on cancelled events', async () => {
    mockLoadData();
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /open event old party/i }));
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('shows empty state when no events exist', async () => {
    mockLoadData(sampleGroup, []);
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
    mockLoadData();
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /open event summer bbq/i }));
    await user.click(screen.getByRole('button', { name: /open event summer bbq/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/groups/g1/events/e1');
  });

  it('navigates to event creation when "+ New Event" is clicked', async () => {
    const user = userEvent.setup();
    mockLoadData();
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /\+ new event/i }));
    await user.click(screen.getByRole('button', { name: /\+ new event/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/groups/g1/events/new');
  });

  it('renders a breadcrumb with a link back to groups', async () => {
    mockLoadData();
    renderGroupDetail();
    await waitFor(() => screen.getByRole('navigation', { name: /breadcrumb/i }));
    expect(screen.getByRole('link', { name: /groups/i })).toBeInTheDocument();
  });

  // ── Edit / Delete visibility ─────────────────────────────────────────────────

  it('shows Edit and Delete buttons for the group owner', async () => {
    mockLoadData();
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /edit group/i }));
    expect(screen.getByRole('button', { name: /edit group/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete group/i })).toBeInTheDocument();
  });

  it('shows Edit but not Delete for an admin member', async () => {
    const adminMembers = [{ userId: 'u2', role: 'admin', joinedAt: '2026-01-01T00:00:00Z' }];
    const adminProfile = { ...sampleProfile, id: 'u2' };
    mockLoadData(sampleGroup, sampleEvents, adminMembers, adminProfile);
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /edit group/i }));
    expect(screen.getByRole('button', { name: /edit group/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete group/i })).not.toBeInTheDocument();
  });

  it('hides Edit and Delete for a regular member', async () => {
    const regularMembers = [{ userId: 'u3', role: 'member', joinedAt: '2026-01-01T00:00:00Z' }];
    const regularProfile = { ...sampleProfile, id: 'u3' };
    mockLoadData(sampleGroup, sampleEvents, regularMembers, regularProfile);
    renderGroupDetail();
    await waitFor(() => screen.getByRole('heading', { name: 'Family' }));
    expect(screen.queryByRole('button', { name: /edit group/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete group/i })).not.toBeInTheDocument();
  });

  // ── Edit group flow ───────────────────────────────────────────────────────────

  it('shows the edit form when Edit is clicked', async () => {
    const user = userEvent.setup();
    mockLoadData();
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /edit group/i }));
    await user.click(screen.getByRole('button', { name: /edit group/i }));
    expect(screen.getByRole('heading', { name: /edit group/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toHaveValue('Family');
    expect(screen.getByLabelText(/description/i)).toHaveValue('Our family group');
  });

  it('cancels editing and returns to the group header', async () => {
    const user = userEvent.setup();
    mockLoadData();
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /edit group/i }));
    await user.click(screen.getByRole('button', { name: /edit group/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('heading', { name: 'Family' })).toBeInTheDocument();
  });

  it('saves the edited group and updates the heading', async () => {
    const user = userEvent.setup();
    const updatedGroup = { ...sampleGroup, name: 'Updated Family', description: 'New desc' };
    mockLoadData();
    mockApiFetch.mockResolvedValueOnce(updatedGroup); // PUT response
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /edit group/i }));
    await user.click(screen.getByRole('button', { name: /edit group/i }));

    const nameInput = screen.getByLabelText(/name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Family');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Updated Family' })).toBeInTheDocument(),
    );
  });

  it('shows an error when saving the edit fails', async () => {
    const user = userEvent.setup();
    mockLoadData();
    mockApiFetch.mockRejectedValueOnce(new Error('Network error')); // PUT failure
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /edit group/i }));
    await user.click(screen.getByRole('button', { name: /edit group/i }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to save changes/i),
    );
  });

  // ── Delete group flow ─────────────────────────────────────────────────────────

  it('shows a confirmation section when Delete is clicked', async () => {
    const user = userEvent.setup();
    mockLoadData();
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /delete group/i }));
    await user.click(screen.getByRole('button', { name: /delete group/i }));
    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();
  });

  it('cancels deletion and returns to the group header', async () => {
    const user = userEvent.setup();
    mockLoadData();
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /delete group/i }));
    await user.click(screen.getByRole('button', { name: /delete group/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('heading', { name: 'Family' })).toBeInTheDocument();
  });

  it('deletes the group and navigates to /groups', async () => {
    const user = userEvent.setup();
    mockLoadData();
    mockApiFetch.mockResolvedValueOnce(undefined); // DELETE 204
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /delete group/i }));
    await user.click(screen.getByRole('button', { name: /delete group/i }));
    await user.click(screen.getByRole('button', { name: /^delete group$/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/groups'));
  });

  it('shows an error when deletion fails', async () => {
    const user = userEvent.setup();
    mockLoadData();
    mockApiFetch.mockRejectedValueOnce(new Error('Network error')); // DELETE failure
    renderGroupDetail();
    await waitFor(() => screen.getByRole('button', { name: /delete group/i }));
    await user.click(screen.getByRole('button', { name: /delete group/i }));
    await user.click(screen.getByRole('button', { name: /^delete group$/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to delete group/i),
    );
  });
});
