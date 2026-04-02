/**
 * Tests for shared UI primitives.
 *
 * Covers rendering, variant styling, accessibility, and ref-forwarding
 * for Card, Input, Textarea, Label, Badge, Avatar, EmptyState, IconButton, and cn.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  cn,
  Card,
  Input,
  Textarea,
  Label,
  Badge,
  Avatar,
  EmptyState,
  IconButton,
} from '../../components/ui';

/* ── cn utility ─────────────────────────────────────────────────────────────── */

describe('cn', () => {
  it('joins class names with a space', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('filters out falsy values', () => {
    expect(cn('a', false, undefined, null, '', 'b')).toBe('a b');
  });

  it('returns empty string when all values are falsy', () => {
    expect(cn(false, undefined, null)).toBe('');
  });
});

/* ── Card ───────────────────────────────────────────────────────────────────── */

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('is a div element', () => {
    render(<Card data-testid="card">Content</Card>);
    expect(screen.getByTestId('card').tagName).toBe('DIV');
  });

  it('applies default padding', () => {
    render(<Card data-testid="card">Content</Card>);
    expect(screen.getByTestId('card').className).toContain('p-nc-lg');
  });

  it('removes padding when noPadding is set', () => {
    render(
      <Card noPadding data-testid="card">
        Content
      </Card>,
    );
    expect(screen.getByTestId('card').className).not.toContain('p-nc-lg');
  });

  it('merges custom className', () => {
    render(
      <Card className="custom-class" data-testid="card">
        Content
      </Card>,
    );
    expect(screen.getByTestId('card').className).toContain('custom-class');
  });

  it('forwards ref to the div element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<Card ref={ref}>Ref test</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});

/* ── Input ──────────────────────────────────────────────────────────────────── */

describe('Input', () => {
  it('renders a text input by default', () => {
    render(<Input aria-label="Name" />);
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });

  it('forwards ref to the input element', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input ref={ref} aria-label="Test" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('accepts user input', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Name" />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'Hello');
    expect(input).toHaveValue('Hello');
  });

  it('applies placeholder text', () => {
    render(<Input placeholder="Enter name" aria-label="Name" />);
    expect(screen.getByPlaceholderText('Enter name')).toBeInTheDocument();
  });

  it('is disabled when disabled prop is set', () => {
    render(<Input disabled aria-label="Name" />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('merges custom className', () => {
    render(<Input className="extra" aria-label="Name" />);
    expect(screen.getByRole('textbox').className).toContain('extra');
  });
});

/* ── Textarea ───────────────────────────────────────────────────────────────── */

describe('Textarea', () => {
  it('renders a textarea element', () => {
    render(<Textarea aria-label="Description" />);
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument();
    expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA');
  });

  it('forwards ref to the textarea element', () => {
    const ref = { current: null as HTMLTextAreaElement | null };
    render(<Textarea ref={ref} aria-label="Test" />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('accepts user input', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Notes" />);
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Some notes');
    expect(textarea).toHaveValue('Some notes');
  });

  it('is disabled when disabled prop is set', () => {
    render(<Textarea disabled aria-label="Notes" />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});

/* ── Label ──────────────────────────────────────────────────────────────────── */

describe('Label', () => {
  it('renders children', () => {
    render(<Label>Display name</Label>);
    expect(screen.getByText('Display name')).toBeInTheDocument();
  });

  it('is a label element', () => {
    render(<Label data-testid="lbl">Test</Label>);
    expect(screen.getByTestId('lbl').tagName).toBe('LABEL');
  });

  it('supports htmlFor', () => {
    render(<Label htmlFor="my-input">Name</Label>);
    expect(screen.getByText('Name')).toHaveAttribute('for', 'my-input');
  });

  it('merges custom className', () => {
    render(
      <Label className="extra" data-testid="lbl">
        Test
      </Label>,
    );
    expect(screen.getByTestId('lbl').className).toContain('extra');
  });
});

/* ── Badge ──────────────────────────────────────────────────────────────────── */

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies default variant', () => {
    render(<Badge data-testid="badge">Default</Badge>);
    expect(screen.getByTestId('badge').className).toContain('bg-nc-surface-subtle');
  });

  it('applies accent variant', () => {
    render(
      <Badge variant="accent" data-testid="badge">
        Accent
      </Badge>,
    );
    expect(screen.getByTestId('badge').className).toContain('bg-nc-accent-subtle');
  });

  it('applies danger variant', () => {
    render(
      <Badge variant="danger" data-testid="badge">
        Danger
      </Badge>,
    );
    expect(screen.getByTestId('badge').className).toContain('bg-nc-danger-subtle');
  });

  it('applies success variant', () => {
    render(
      <Badge variant="success" data-testid="badge">
        Success
      </Badge>,
    );
    expect(screen.getByTestId('badge').className).toContain('bg-nc-success-subtle');
  });

  it('merges custom className', () => {
    render(
      <Badge className="custom" data-testid="badge">
        Test
      </Badge>,
    );
    expect(screen.getByTestId('badge').className).toContain('custom');
  });
});

/* ── Avatar ─────────────────────────────────────────────────────────────────── */

describe('Avatar', () => {
  it('renders fallback text when no src is provided', async () => {
    render(<Avatar fallback="JD" />);
    await waitFor(() => expect(screen.getByText('JD')).toBeInTheDocument());
  });

  it('applies sm size class', () => {
    const { container } = render(<Avatar fallback="A" size="sm" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-8');
  });

  it('applies md size class by default', () => {
    const { container } = render(<Avatar fallback="A" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-10');
  });

  it('applies lg size class', () => {
    const { container } = render(<Avatar fallback="A" size="lg" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('h-16');
  });

  it('renders fallback when src fails to load', async () => {
    render(<Avatar src="https://example.com/avatar.png" alt="User" fallback="U" />);
    // Radix Avatar shows fallback after image load fails in jsdom (no real image loading)
    await waitFor(() => expect(screen.getByText('U')).toBeInTheDocument());
  });
});

/* ── EmptyState ─────────────────────────────────────────────────────────────── */

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No events" />);
    expect(screen.getByText('No events')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="No events" description="Create one to get started" />);
    expect(screen.getByText('Create one to get started')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState title="No events" />);
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="Empty" icon={<span data-testid="icon">📭</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(<EmptyState title="Empty" action={<button>Create</button>} />);
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('merges custom className', () => {
    const { container } = render(<EmptyState title="Empty" className="my-class" />);
    expect((container.firstElementChild as HTMLElement).className).toContain('my-class');
  });
});

/* ── IconButton ─────────────────────────────────────────────────────────────── */

describe('IconButton', () => {
  it('renders a button with aria-label', () => {
    render(<IconButton aria-label="Delete">🗑</IconButton>);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('applies ghost variant by default', () => {
    render(<IconButton aria-label="Edit">✏️</IconButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-nc-content-secondary');
  });

  it('applies outline variant', () => {
    render(
      <IconButton variant="outline" aria-label="Edit">
        ✏️
      </IconButton>,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('border-nc-border-interactive');
  });

  it('applies danger variant', () => {
    render(
      <IconButton variant="danger" aria-label="Delete">
        🗑
      </IconButton>,
    );
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('text-nc-danger-default');
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconButton aria-label="Action" onClick={onClick}>
        ⚡
      </IconButton>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled prop is set', () => {
    render(
      <IconButton disabled aria-label="Disabled">
        X
      </IconButton>,
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('forwards ref to the button element', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(
      <IconButton ref={ref} aria-label="Ref test">
        R
      </IconButton>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('has type="button" by default', () => {
    render(<IconButton aria-label="Test">T</IconButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
