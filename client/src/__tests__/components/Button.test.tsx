/**
 * Tests for Button component.
 *
 * Verifies accessibility, variant rendering, and keyboard interaction.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../../components/Button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('is a native button element', () => {
    render(<Button>Test</Button>);
    expect(screen.getByRole('button')).toBeInstanceOf(HTMLButtonElement);
  });

  it('applies primary variant by default', () => {
    render(<Button>Primary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/primary/);
  });

  it('applies secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/secondary/);
  });

  it('applies danger variant', () => {
    render(<Button variant="danger">Danger</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toMatch(/danger/);
  });

  it('is disabled when disabled prop is set', () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Disabled
      </Button>,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is keyboard activatable via Enter', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Action</Button>);
    screen.getByRole('button').focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is keyboard activatable via Space', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Action</Button>);
    screen.getByRole('button').focus();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('respects aria-label', () => {
    render(<Button aria-label="Delete event BBQ Saturday">Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete event BBQ Saturday' })).toBeInTheDocument();
  });

  it('applies fullWidth class when fullWidth prop is set', () => {
    render(<Button fullWidth>Full width</Button>);
    expect(screen.getByRole('button').className).toMatch(/fullWidth/);
  });

  it('forwards ref to the button element', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Ref test</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
