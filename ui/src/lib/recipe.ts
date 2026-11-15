import type { TIngredient, TPhoto, TRecipe, TStep } from '@/lib/api';

/** Pastel pill colours, assigned to tags by position in a cycle (text on them stays --text). */
export const TAG_TINTS = [
  'var(--accent)',
  'var(--pastel-peach)',
  'var(--pastel-lavender)',
  'var(--pastel-yellow)',
  'var(--pastel-blue)',
];
export const tagTint = (i: number) => TAG_TINTS[i % TAG_TINTS.length]!;

/** Placeholder tints while a photo loads (or when there is none). */
export const PHOTO_TINTS = [
  'var(--ph-1)',
  'var(--ph-2)',
  'var(--ph-3)',
  'var(--ph-4)',
  'var(--ph-5)',
];
export const photoTint = (i: number) => PHOTO_TINTS[i % PHOTO_TINTS.length]!;

export const MIN_SERVINGS = 1;
/** −/+ goes up to 24, or the recipe's own base if that is larger. */
export const maxServings = (base: number) => Math.max(24, base);

const formatNumber = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const parseNumber = (s: string) => parseFloat(s.replace(',', '.'));

const QUANTITY = /^(\d+(?:[.,]\d+)?)(?:\s*([-–])\s*(\d+(?:[.,]\d+)?))?\s*(.*)$/;

/**
 * «500 г» for 4 servings shown at 5 → «625 г». Only quantities that start with a number scale
 * (a range «2–3 шт» scales both ends); «дрібка», «за смаком» stay as written.
 */
export function scaleQuantity(quantity: string, servings: number, base: number): string {
  const m = QUANTITY.exec(quantity.trim());
  if (!m || servings === base || base <= 0) {
    return quantity;
  }
  const k = servings / base;
  const [, from, dash, to, unit] = m;
  let n = formatNumber(parseNumber(from!) * k);
  if (to) {
    n += dash + formatNumber(parseNumber(to) * k);
  }
  return unit ? `${n} ${unit}` : n;
}

/** «на 1 порцію / 2–4 порції / 5+ порцій», with Ukrainian rules for 11–14, 21, 22… */
export function servingsLabel(n: number): string {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) {
    return `на ${n} порцію`;
  }
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) {
    return `на ${n} порції`;
  }
  return `на ${n} порцій`;
}

/** Seconds → «9:42» (rounded up, so a timer shows 0:00 only when it is really done). */
export function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** The editor's «Таймер, хв» field ↔ the API's seconds; fractions allowed, empty = no timer. */
export function minutesToSeconds(text: string): number | null {
  const n = parseNumber(text.trim());
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return Math.max(1, Math.round(n * 60));
}

export function secondsToMinutes(seconds?: number | null): string {
  return seconds ? formatNumber(seconds / 60) : '';
}

const dayMonth = new Intl.DateTimeFormat('uk', { day: 'numeric', month: 'long' });
const dayMonthYear = new Intl.DateTimeFormat('uk', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const formatDay = (iso: string) => {
  const d = new Date(iso);
  return (d.getFullYear() === new Date().getFullYear() ? dayMonth : dayMonthYear).format(d);
};

/** «Додано 3 листопада · змінено 12 листопада» (the second part only when it differs). */
export function datesLine(created: string, updated: string): string {
  const c = formatDay(created);
  const u = formatDay(updated);
  return c === u ? `Додано ${c}` : `Додано ${c} · змінено ${u}`;
}

// ---------------------------------------------------------------------------------------------
// Editor draft: the recipe as the edit form holds it. List items carry a client `key` so React
// and drag-and-drop can track rows that have no server id yet.

export type DraftPhoto = {
  key: string;
  /** server id once uploaded */
  id?: string;
  /** object URL of the picked file, shown while uploading and until the page is left */
  preview?: string;
  status: 'ready' | 'uploading' | 'error';
  error?: string;
};

export type DraftIngredient = { key: string; id?: number; name: string; quantity: string };

export type DraftStep = {
  key: string;
  id?: number;
  text: string;
  /** minutes as typed, e.g. «1,5» */
  timer: string;
  photos: DraftPhoto[];
};

export type Draft = {
  title: string;
  description: string;
  timeText: string;
  servings: number;
  tags: string[];
  photos: DraftPhoto[];
  ingredients: DraftIngredient[];
  steps: DraftStep[];
};

let keySeq = 0;
export const newKey = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;

const photoToDraft = (p: TPhoto): DraftPhoto => ({ key: p.id, id: p.id, status: 'ready' });

export const emptyDraft = (): Draft => ({
  title: '',
  description: '',
  timeText: '',
  servings: 4,
  tags: [],
  photos: [],
  ingredients: [{ key: newKey(), name: '', quantity: '' }],
  steps: [{ key: newKey(), text: '', timer: '', photos: [] }],
});

export function recipeToDraft(r: TRecipe): Draft {
  return {
    title: r.title,
    description: r.description,
    timeText: r.timeText,
    servings: r.servings,
    tags: [...r.tags],
    photos: r.photos.map(photoToDraft),
    ingredients: r.ingredients.map((x: TIngredient) => ({
      key: String(x.id ?? newKey()),
      id: x.id,
      name: x.name,
      quantity: x.quantity,
    })),
    steps: r.steps.map((s: TStep) => ({
      key: String(s.id ?? newKey()),
      id: s.id,
      text: s.text,
      timer: secondsToMinutes(s.timerSeconds),
      photos: s.photos.map(photoToDraft),
    })),
  };
}

const uploadedPhotos = (photos: DraftPhoto[]) =>
  photos.filter((p) => p.id).map((p) => ({ id: p.id! }) as TPhoto);

/** Request body for create/update; blank ingredient and step rows are dropped. */
export function draftToRecipe(d: Draft, base?: TRecipe): TRecipe {
  return {
    id: base?.id ?? 0,
    version: base?.version ?? 0,
    createdAt: base?.createdAt ?? '',
    updatedAt: base?.updatedAt ?? '',
    title: d.title.trim(),
    description: d.description.trim(),
    timeText: d.timeText.trim(),
    servings: d.servings,
    tags: d.tags,
    photos: uploadedPhotos(d.photos),
    ingredients: d.ingredients
      .filter((x) => x.name.trim() || x.quantity.trim())
      .map((x) => ({ id: x.id, name: x.name.trim(), quantity: x.quantity.trim() })),
    steps: d.steps
      .filter((s) => s.text.trim() || s.photos.some((p) => p.id))
      .map((s) => ({
        id: s.id,
        text: s.text.trim(),
        timerSeconds: minutesToSeconds(s.timer),
        photos: uploadedPhotos(s.photos),
      })),
  };
}

/** True when a new recipe has nothing worth saving. */
export const isDraftEmpty = (d: Draft) => {
  const r = draftToRecipe(d);
  return (
    !r.title &&
    !r.description &&
    !r.timeText &&
    r.tags.length === 0 &&
    r.photos.length === 0 &&
    r.ingredients.length === 0 &&
    r.steps.length === 0
  );
};

/** Server fields are stripped of readOnly parts the API ignores anyway, to keep requests small. */
export const toRequest = (r: TRecipe): TRecipe => {
  const { createdAt, updatedAt, ...rest } = r;
  return rest as TRecipe;
};

/** Normalizes a typed tag the same way the server will. */
export const normalizeTag = (t: string) => t.trim().replace(/\s+/g, ' ').toLowerCase();
