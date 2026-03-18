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
 */

import { PublicClientApplication } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from './design-system/ThemeContext';
import { SkipLink } from './components/SkipLink';
import { msalConfig } from './auth/msal-config';
import { router } from './router';
import './design-system/global.css';

/** Singleton MSAL instance — must be created once outside render. */
const msalInstance = new PublicClientApplication(msalConfig);

export function App() {
  return (
    <ThemeProvider>
      <SkipLink />
      <MsalProvider instance={msalInstance}>
        <RouterProvider router={router} />
      </MsalProvider>
    </ThemeProvider>
  );
}
