import { Navigate, Outlet, useLocation } from 'react-router';

import { useMe } from '@/hooks/useAuth';

import { routes } from './routes';

/** Gate for every screen except /login: signed-out visitors go to /login?return_to=<here>. */
export function RequireAuth() {
  const { user, isLoading } = useMe();
  const location = useLocation();

  if (isLoading) {
    // a blank screen for the few ms of the /me call reads better than a spinner flash
    return null;
  }

  if (!user) {
    const here = location.pathname + location.search;
    const qs = here === '/' ? '' : '?' + new URLSearchParams({ return_to: here }).toString();
    return <Navigate replace to={routes.login.toPath() + qs} />;
  }

  return <Outlet />;
}
