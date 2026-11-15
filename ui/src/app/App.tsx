import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy } from 'react';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router';

import { CookingProvider } from '@/contexts/Cooking';
import { meQueryKey } from '@/hooks/useAuth';
import { ApiError, basename } from '@/lib/api';

import { RequireAuth } from './RequireAuth';
import { routes } from './routes';

const Login = lazy(() => import('@/pages/Login'));
const Library = lazy(() => import('@/pages/Library'));
const Recipe = lazy(() => import('@/pages/Recipe'));
const Cook = lazy(() => import('@/pages/Cook'));

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // a session that expired mid-use: dropping the user sends RequireAuth to /login
      if (error instanceof ApiError && error.status === 401 && query.queryKey !== meQueryKey) {
        queryClient.setQueryData(meQueryKey, null);
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

const router = createBrowserRouter(
  [
    { path: routes.login.path, element: <Login /> },
    {
      element: <RequireAuth />,
      children: [
        { path: routes.library.path, element: <Library /> },
        { path: routes.recipeNew.path, element: <Recipe /> },
        { path: routes.recipe.path, element: <Recipe /> },
        { path: routes.cook.path, element: <Cook /> },
        { path: '*', element: <Navigate replace to={routes.library.toPath()} /> },
      ],
    },
  ],
  { basename },
);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CookingProvider>
        <RouterProvider router={router} />
      </CookingProvider>
    </QueryClientProvider>
  );
}
