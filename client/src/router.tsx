/**
 * Application router — defines all client-side routes.
 *
 * Route structure:
 *  /login                                → Login page (unauthenticated landing)
 *  /groups                               → GroupsList (authenticated)
 *  /groups/:groupId                      → GroupDetail (authenticated)
 *  /groups/:groupId/events/new           → EventCreate (authenticated)
 *  /groups/:groupId/events/:eventId      → EventDetail (authenticated)
 *  /profile                              → Profile (authenticated)
 *  /                                     → Redirect to /groups
 *  *                                     → Redirect to /groups
 *
 * Authenticated routes are wrapped in AppShell (persistent nav bar) and
 * ProtectedRoute (redirects unauthenticated users to /login).
 */

import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
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
    path: '/',
    element: (
      <ProtectedRoute>
        <AppShell />
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
