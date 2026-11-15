import createClient from 'openapi-fetch';

import { apiUrl } from './config';
import { ApiPaths, type components, type operations, type paths } from './schema';

export { ApiPaths } from './schema';

const $client = createClient<paths>({
  baseUrl: apiUrl,
  credentials: 'include',
});

export type TError = components['schemas']['Error'];
export type TUser = components['schemas']['User'];
export type TAuthProvider = components['schemas']['AuthProvider'];
export type TRecipe = components['schemas']['Recipe'];
export type TRecipeSummary = components['schemas']['RecipeSummary'];
export type TIngredient = components['schemas']['Ingredient'];
export type TStep = components['schemas']['Step'];
export type TPhoto = components['schemas']['Photo'];
export type TTagCount = components['schemas']['TagCount'];

export type TPhotoWidth = NonNullable<operations['photos.get']['parameters']['query']>['w'];

/** Error thrown by `unwrap` for any non-2xx answer; `body` is the server's Error when it sent one. */
export class ApiError extends Error {
  readonly status: number;
  readonly body?: TError;

  constructor(status: number, body?: TError) {
    super(body?.message || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

/**
 * Turns an openapi-fetch result into its data or an ApiError, so react-query sees failures as
 * rejections.
 */
export async function unwrap<T>(
  promise: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  const { data, error, response } = await promise;
  if (!response.ok) {
    throw new ApiError(response.status, (error as TError | undefined) ?? undefined);
  }
  return data as T;
}

/** URL of a photo variant; photos are served by the API, which checks ownership. */
export const photoUrl = (id: string, w: TPhotoWidth = 1280) => `${apiUrl}/photos/${id}?w=${w}`;

/** Where the browser goes to start a login; a full navigation, not a fetch. */
export const loginUrl = (provider: TAuthProvider, returnTo?: string) =>
  provider.url + (returnTo ? '?' + new URLSearchParams({ return_to: returnTo }).toString() : '');

const photoUpload = (file: File, signal?: AbortSignal) => {
  const body = new FormData();
  body.append('file', file);
  // the multipart body is built here; the generated type describes the form fields instead
  return $client.POST(ApiPaths.photos_upload, {
    body: body as unknown as { file: string },
    signal,
  });
};

const $operations = {
  'auth.providers': () => $client.GET(ApiPaths.auth_providers),
  'auth.logout': () => $client.POST(ApiPaths.auth_logout),
  'auth.me': () => $client.GET(ApiPaths.auth_me),

  'recipes.list': (query?: operations['recipes.list']['parameters']['query']) =>
    $client.GET(ApiPaths.recipes_list, { params: { query } }),
  'recipes.create': (recipe: TRecipe) => $client.POST(ApiPaths.recipes_create, { body: recipe }),
  'recipes.get': (id: number) => $client.GET(ApiPaths.recipes_get, { params: { path: { id } } }),
  'recipes.update': (recipe: TRecipe) =>
    $client.PUT(ApiPaths.recipes_update, {
      params: { path: { id: recipe.id }, header: { 'If-Match': `"${recipe.version}"` } },
      body: recipe,
    }),
  'recipes.delete': (id: number) =>
    $client.DELETE(ApiPaths.recipes_delete, { params: { path: { id } } }),

  'tags.list': () => $client.GET(ApiPaths.tags_list),

  'photos.upload': photoUpload,
} satisfies {
  // the auth redirects and the photo file are browser navigations / <img> sources, not fetches
  [K in Exclude<keyof operations, 'auth.login' | 'auth.callback' | 'photos.get'>]: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) => Promise<unknown>;
};

export default $operations;
