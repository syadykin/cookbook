import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import $api, { type TRecipe, unwrap } from '@/lib/api';
import { toRequest } from '@/lib/recipe';

export const recipeKey = (id: number) => ['recipe', id] as const;

export function useRecipeList(params: { q?: string; tag?: string }) {
  const query = {
    ...(params.q ? { q: params.q } : {}),
    ...(params.tag ? { tag: params.tag } : {}),
  };
  return useQuery({
    queryKey: ['recipes', query],
    queryFn: () => unwrap($api['recipes.list'](query)),
    // keep the old rows on screen while a new search runs, instead of flashing empty
    placeholderData: keepPreviousData,
  });
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => unwrap($api['tags.list']()),
    staleTime: 60_000,
  });
}

export function useRecipe(id: number | undefined) {
  return useQuery({
    queryKey: recipeKey(id ?? 0),
    queryFn: () => unwrap($api['recipes.get'](id!)),
    enabled: !!id,
  });
}

export function useSaveRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (recipe: TRecipe) =>
      unwrap(
        recipe.id
          ? $api['recipes.update'](toRequest(recipe))
          : $api['recipes.create'](toRequest(recipe)),
      ),
    onSuccess: (saved) => {
      client.setQueryData(recipeKey(saved.id), saved);
      void client.invalidateQueries({ queryKey: ['recipes'] });
      void client.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useDeleteRecipe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => unwrap($api['recipes.delete'](id)),
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: recipeKey(id) });
      void client.invalidateQueries({ queryKey: ['recipes'] });
      void client.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export async function uploadPhoto(file: File) {
  return unwrap($api['photos.upload'](file));
}
