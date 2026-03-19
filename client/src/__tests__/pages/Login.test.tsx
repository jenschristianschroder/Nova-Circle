/**
 * Tests for the Login page.
 *
 * Verifies that unauthenticated users see the login screen with a sign-in
 * button and that clicking it triggers the MSAL login redirect flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '../../design-system/ThemeContext';
import { Login } from '../../pages/Login';

// Mock useAuth so Login doesn't need a real MSAL context.
const mockLogin = vi.fn().mockResolvedValue(undefined);

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    account: null,
    getAccessToken: vi.fn(),
    login: mockLogin,
    logout: vi.fn(),
  }),
}));

function renderLogin() {
  return render(
    <ThemeProvider>
      <Login />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  mockLogin.mockClear();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-palette');
  document.documentElement.style.cssText = '';
});

describe('Login page', () => {
  it('renders the brand name', () => {
    renderLogin();
    expect(screen.getByText('Nova-Circle')).toBeInTheDocument();
  });

  it('renders the hero heading', () => {
    renderLogin();
    expect(
      screen.getByRole('heading', { name: /your private group calendar/i }),
    ).toBeInTheDocument();
  });

  it('renders the sign-in button', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders the features section', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: /what nova-circle offers/i })).toBeInTheDocument();
  });

  it('renders a banner landmark', () => {
    renderLogin();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('renders a contentinfo landmark (footer)', () => {
    renderLogin();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('calls login when the sign-in button is clicked', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(mockLogin).toHaveBeenCalledOnce();
  });

  it('does not render the component showcase or token swatches', () => {
    renderLogin();
    expect(screen.queryByRole('heading', { name: /component showcase/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: /colour token swatches/i })).not.toBeInTheDocument();
  });
});
