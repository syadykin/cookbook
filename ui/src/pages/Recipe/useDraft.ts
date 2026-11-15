import { useEffect, useRef, useState } from 'react';

import { storage } from '@/hooks/useLocalStorage';
import { uploadPhoto } from '@/hooks/useRecipes';
import { ApiError, type TRecipe } from '@/lib/api';
import {
  type Draft,
  type DraftIngredient,
  type DraftPhoto,
  type DraftStep,
  emptyDraft,
  newKey,
  normalizeTag,
  recipeToDraft,
} from '@/lib/recipe';

/** 'recipe' for the recipe's own photos, otherwise a step's key. */
export type PhotoTarget = 'recipe' | string;

type Stored = {
  /** recipe version the edit started from; a save against a newer server copy must conflict */
  baseVersion: number;
  draft: Draft;
  savedAt: number;
};

const storageKey = (id?: number) => `draft:recipe:${id ?? 'new'}`;

/** Only finished uploads survive a reload; object URLs and in-flight uploads do not. */
const persistable = (d: Draft): Draft => {
  const keep = (photos: DraftPhoto[]) =>
    photos.filter((p) => p.id).map(({ key, id }) => ({ key, id, status: 'ready' as const }));
  return {
    ...d,
    photos: keep(d.photos),
    steps: d.steps.map((s) => ({ ...s, photos: keep(s.photos) })),
  };
};

const uploadError = (e: unknown) => {
  if (e instanceof ApiError) {
    return e.body?.message ?? `Помилка ${e.status}`;
  }
  return 'Немає з’єднання';
};

/**
 * The edit form's state. Every change is mirrored to localStorage, so closing the tab or losing
 * the connection never loses work; the stored draft is restored the next time editing starts.
 */
export function useDraft(recipe?: TRecipe) {
  const key = storageKey(recipe?.id);

  const [initial] = useState(() => {
    const stored = storage.get<Stored>(key);
    if (stored) {
      return { draft: stored.draft, baseVersion: stored.baseVersion, restored: true };
    }
    return {
      draft: recipe ? recipeToDraft(recipe) : emptyDraft(),
      baseVersion: recipe?.version ?? 0,
      restored: false,
    };
  });

  const [draft, setDraft] = useState<Draft>(initial.draft);
  const [baseVersion, setBaseVersion] = useState(initial.baseVersion);
  const touched = useRef(initial.restored);

  useEffect(() => {
    // the untouched initial state is the server copy itself; storing it would only make the next
    // visit claim a "restored draft"
    if (touched.current) {
      storage.set(key, {
        baseVersion,
        draft: persistable(draft),
        savedAt: Date.now(),
      } satisfies Stored);
    }
  }, [key, baseVersion, draft]);

  const objectUrls = useRef<string[]>([]);
  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const update = (fn: (d: Draft) => Draft) => {
    touched.current = true;
    setDraft(fn);
  };

  const mapPhotos = (d: Draft, fn: (photos: DraftPhoto[]) => DraftPhoto[]): Draft => ({
    ...d,
    photos: fn(d.photos),
    steps: d.steps.map((s) => ({ ...s, photos: fn(s.photos) })),
  });

  const patchPhoto = (photoKey: string, patch: Partial<DraftPhoto>) =>
    update((d) =>
      mapPhotos(d, (ps) => ps.map((p) => (p.key === photoKey ? { ...p, ...patch } : p))),
    );

  const addPhotos = (target: PhotoTarget, files: File[]) => {
    const added = files.map((file) => {
      const preview = URL.createObjectURL(file);
      objectUrls.current.push(preview);
      return { file, photo: { key: newKey(), preview, status: 'uploading' } as DraftPhoto };
    });
    const photos = added.map((a) => a.photo);
    update((d) =>
      target === 'recipe'
        ? { ...d, photos: [...d.photos, ...photos] }
        : {
            ...d,
            steps: d.steps.map((s) =>
              s.key === target ? { ...s, photos: [...s.photos, ...photos] } : s,
            ),
          },
    );
    for (const { file, photo } of added) {
      uploadPhoto(file).then(
        (p) => patchPhoto(photo.key, { id: p.id, status: 'ready' }),
        (e) => patchPhoto(photo.key, { status: 'error', error: uploadError(e) }),
      );
    }
  };

  const removePhoto = (photoKey: string) =>
    update((d) => mapPhotos(d, (ps) => ps.filter((p) => p.key !== photoKey)));

  const patchIngredient = (k: string, patch: Partial<DraftIngredient>) =>
    update((d) => ({
      ...d,
      ingredients: d.ingredients.map((x) => (x.key === k ? { ...x, ...patch } : x)),
    }));

  const patchStep = (k: string, patch: Partial<DraftStep>) =>
    update((d) => ({ ...d, steps: d.steps.map((x) => (x.key === k ? { ...x, ...patch } : x)) }));

  const allPhotos = [...draft.photos, ...draft.steps.flatMap((s) => s.photos)];

  return {
    draft,
    baseVersion,
    restored: initial.restored,
    uploading: allPhotos.some((p) => p.status === 'uploading'),

    set: <K extends keyof Draft>(field: K, value: Draft[K]) =>
      update((d) => ({ ...d, [field]: value })),

    addTag: (raw: string) => {
      const t = normalizeTag(raw);
      if (t) {
        update((d) => (d.tags.includes(t) ? d : { ...d, tags: [...d.tags, t] }));
      }
    },
    removeTag: (t: string) => update((d) => ({ ...d, tags: d.tags.filter((x) => x !== t) })),

    addIngredient: () => {
      const row = { key: newKey(), name: '', quantity: '' };
      update((d) => ({ ...d, ingredients: [...d.ingredients, row] }));
      return row.key;
    },
    patchIngredient,
    removeIngredient: (k: string) =>
      update((d) => ({ ...d, ingredients: d.ingredients.filter((x) => x.key !== k) })),
    reorderIngredients: (rows: DraftIngredient[]) => update((d) => ({ ...d, ingredients: rows })),

    addStep: () => {
      const row = { key: newKey(), text: '', timer: '', photos: [] };
      update((d) => ({ ...d, steps: [...d.steps, row] }));
      return row.key;
    },
    patchStep,
    removeStep: (k: string) => update((d) => ({ ...d, steps: d.steps.filter((x) => x.key !== k) })),
    reorderSteps: (rows: DraftStep[]) => update((d) => ({ ...d, steps: rows })),

    addPhotos,
    removePhoto,

    /** after a conflict the user chose to keep their edits: save them over the newer version */
    rebase: (version: number) => {
      touched.current = true;
      setBaseVersion(version);
    },
    discard: () => {
      // stop the mirror effect from writing the draft straight back
      touched.current = false;
      storage.remove(key);
    },
  };
}

export type DraftApi = ReturnType<typeof useDraft>;
