import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import $api, { ApiError, type TUser, unwrap } from '@/lib/api';

export const meQueryKey = ['me'] as const;

/** The signed-in user, `null` when signed out, `undefined` while the first check runs. */
export function useMe() {
  const query = useQuery({
    queryKey: meQueryKey,
    queryFn: async (): Promise<TUser | null> => {
      try {
        return await unwrap($api['auth.me']());
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          return null;
        }
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: (count, e) => !(e instanceof ApiError) && count < 2,
  });
  return { user: query.data, isLoading: query.isPending, error: query.error };
}

export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: () => unwrap($api['auth.providers']()),
    staleTime: Infinity,
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap($api['auth.logout']()),
    onSettled: () => {
      // everything cached belongs to the user who just left
      client.clear();
      client.setQueryData(meQueryKey, null);
    },
  });
}
