/**
 * App root component.
 *
 * Provider hierarchy (outermost → innermost):
 *   ThemeProvider  — design-system tokens & colour-scheme persistence
 *   MsalProvider   — Azure Entra ID authentication
 *   RouterProvider — client-side routing (React Router v7)
 *
 * The SkipLink is rendered inside ThemeProvider so it inherits tokens,
 * but outside the router so it is always reachable via keyboard.
 *
 * When VITE_AZURE_CLIENT_ID / VITE_AZURE_TENANT_ID are absent (e.g. a
 * local build without an .env file) the app renders a configuration error
 * instead of silently constructing a broken MSAL instance.
 */

import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './design-system/ThemeContext';
import { SkipLink } from './components/SkipLink';
import { ConfigError } from './components/ConfigError';
import { msalConfig, msalConfigured } from './auth/msal-config';
import { router } from './router';
import './design-system/global.css';

/** Singleton MSAL instance — must be created once outside render. */
const msalInstance = msalConfigured ? new PublicClientApplication(msalConfig) : null;

export function App() {
  if (!msalInstance) {
    return (
      <ThemeProvider>
        <ConfigError />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SkipLink />
      <MsalProvider instance={msalInstance}>
        <RouterProvider router={router} />
      </MsalProvider>
    </ThemeProvider>
  );
}
