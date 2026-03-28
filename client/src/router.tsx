/**
 * Application router — defines all client-side routes.
 *
 * Route structure:
 *  /login                                → Login page (unauthenticated landing)
 *  /signup                               → SignUp page (authenticated, unregistered)
 *  /groups                               → GroupsList (authenticated + registered)
 *  /groups/:groupId                      → GroupDetail (authenticated + registered)
 *  /groups/:groupId/events/new           → EventCreate (authenticated + registered)
 *  /groups/:groupId/events/:eventId      → EventDetail (authenticated + registered)
 *  /profile                              → Profile (authenticated + registered)
 *  /                                     → Redirect to /groups
 *  *                                     → Redirect to /groups
 *
 * Authenticated routes are wrapped in AppShell (persistent nav bar),
 * ProtectedRoute (redirects unauthenticated users to /login), and
 * RegistrationGate (redirects unregistered users to /signup).
 */

import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RegistrationGate } from './components/RegistrationGate';
import { Login } from './pages/Login';
import { SignUp } from './pages/SignUp';
import { GroupsList } from './pages/GroupsList';
import { GroupDetail } from './pages/GroupDetail';
import { EventDetail } from './pages/EventDetail';
import { EventCreate } from './pages/EventCreate';
import { Profile } from './pages/Profile';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/signup',
    element: (
      <ProtectedRoute>
        <SignUp />
      </ProtectedRoute>
    ),
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <RegistrationGate>
          <AppShell />
        </RegistrationGate>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/groups" replace /> },
      { path: 'groups', element: <GroupsList /> },
      { path: 'groups/:groupId', element: <GroupDetail /> },
      { path: 'groups/:groupId/events/new', element: <EventCreate /> },
      { path: 'groups/:groupId/events/:eventId', element: <EventDetail /> },
      { path: 'profile', element: <Profile /> },
      { path: '*', element: <Navigate to="/groups" replace /> },
    ],
  },
]);
