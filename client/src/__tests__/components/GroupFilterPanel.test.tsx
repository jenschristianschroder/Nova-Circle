/**
 * Tests for the GroupFilterPanel component.
 *
 * Verifies rendering of group list, personal events toggle, select all /
 * deselect all, and group colour swatches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GroupFilterPanel } from '../../pages/Calendar/GroupFilterPanel';
import { buildGroupColorMap } from '../../utils/group-colors';
import type { Group } from '../../api/groups';

const sampleGroups: Group[] = [
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

const groupColorMap = buildGroupColorMap(sampleGroups.map((g) => g.id));

describe('GroupFilterPanel', () => {
  const onTogglePersonal = vi.fn();
  const onToggleGroup = vi.fn();
  const onSelectAll = vi.fn();
  const onDeselectAll = vi.fn();
  const isGroupVisible = vi.fn().mockReturnValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    isGroupVisible.mockReturnValue(true);
  });

  function renderPanel(overrides: { showPersonal?: boolean } = {}) {
    return render(
      <GroupFilterPanel
        groups={sampleGroups}
        groupColorMap={groupColorMap}
        showPersonal={overrides.showPersonal ?? true}
        isGroupVisible={isGroupVisible}
        onTogglePersonal={onTogglePersonal}
        onToggleGroup={onToggleGroup}
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
      />,
    );
  }

  it('renders the filter panel with aria-label', () => {
    renderPanel();
    expect(screen.getByRole('complementary', { name: 'Calendar filter' })).toBeInTheDocument();
  });

  it('renders the personal events checkbox', () => {
    renderPanel();
    const checkbox = screen.getByRole('checkbox', { name: /personal events/i });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toBeChecked();
  });

  it('renders personal events unchecked when showPersonal is false', () => {
    renderPanel({ showPersonal: false });
    expect(screen.getByRole('checkbox', { name: /personal events/i })).not.toBeChecked();
  });

  it('renders each group as a checkbox row', () => {
    renderPanel();
    expect(screen.getByRole('checkbox', { name: /family/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /work/i })).toBeInTheDocument();
  });

  it('calls onTogglePersonal when personal events checkbox is clicked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('checkbox', { name: /personal events/i }));
    expect(onTogglePersonal).toHaveBeenCalledOnce();
  });

  it('calls onToggleGroup with group id when a group checkbox is clicked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('checkbox', { name: /family/i }));
    expect(onToggleGroup).toHaveBeenCalledWith('g1');
  });

  it('renders All button that calls onSelectAll', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(onSelectAll).toHaveBeenCalledOnce();
  });

  it('renders None button that calls onDeselectAll', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole('button', { name: 'None' }));
    expect(onDeselectAll).toHaveBeenCalledOnce();
  });

  it('renders colour swatches for each group', () => {
    renderPanel();
    // Personal swatch + 2 group swatches = 3 total
    const swatches = document.querySelectorAll('[aria-hidden="true"]');
    // Filter to only swatches with background-color
    const colorSwatches = Array.from(swatches).filter(
      (el) => (el as HTMLElement).style.backgroundColor,
    );
    expect(colorSwatches.length).toBe(3);
  });

  it('renders the Filter heading', () => {
    renderPanel();
    expect(screen.getByText('Filter')).toBeInTheDocument();
  });

  it('shows group as unchecked when isGroupVisible returns false', () => {
    isGroupVisible.mockReturnValue(false);
    renderPanel();
    expect(screen.getByRole('checkbox', { name: /family/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /work/i })).not.toBeChecked();
  });
});
