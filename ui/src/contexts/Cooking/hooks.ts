import { useContext } from 'react';

import { MIN_MULTIPLIER, MIN_SERVINGS, maxServings } from '@/lib/recipe';

import { CookingContext, type TimerState } from './context';

function useCooking() {
  const ctx = useContext(CookingContext);
  if (!ctx) {
    throw new Error('CookingProvider is missing');
  }
  return ctx;
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

/** A step's timer; `key` must be stable across pages (recipe id + step id). */
export function useTimer(key: string, totalSeconds: number) {
  const { timers, now, setTimer, startTimer } = useCooking();

  let x = timers[key];
  // the step's duration was edited since this timer was used: start over from the new value
  if (!x || x.total !== totalSeconds) {
    x = { total: totalSeconds, left: totalSeconds, endAt: null, done: false };
  }
  const fresh: TimerState = { total: totalSeconds, left: totalSeconds, endAt: null, done: false };

  const running = x.endAt !== null;
  const left = running ? (x.endAt! - now) / 1000 : x.left;
  const status: TimerStatus = x.done
    ? 'done'
    : running
      ? 'running'
      : x.left < totalSeconds
        ? 'paused'
        : 'idle';

  return {
    status,
    left,
    /** the big button: start / pause / resume, or acknowledge a finished timer */
    toggle: () => {
      if (status === 'done') {
        setTimer(key, fresh);
      } else if (status === 'running') {
        setTimer(key, { ...x, left: Math.max(0, (x.endAt! - Date.now()) / 1000), endAt: null });
      } else {
        startTimer(key, { ...x, endAt: Date.now() + x.left * 1000 });
      }
    },
    reset: () => setTimer(key, fresh),
  };
}

export const timerKey = (recipeId: number, stepId: number | undefined, index: number) =>
  `${recipeId}:${stepId ?? `i${index}`}`;

/**
 * Servings shown for a recipe (−/+), shared by the recipe page and cook mode. A recipe with 0
 * servings gets a multiplier instead: quantities are then for ×1, i.e. `base` is 1.
 */
export function useServings(recipeId: number, recipeServings: number) {
  const { sessions, updateSession } = useCooking();
  const multiplier = recipeServings === 0;
  const base = multiplier ? 1 : recipeServings;
  const min = multiplier ? MIN_MULTIPLIER : MIN_SERVINGS;
  const max = maxServings(base);
  const stored = sessions[recipeId]?.servings;
  // a count picked before the recipe's own servings were edited (say, to 0) means nothing now
  const servings = stored?.base === recipeServings ? stored.shown : base;
  const set = (n: number) =>
    updateSession(recipeId, (s) => ({
      ...s,
      servings: { base: recipeServings, shown: Math.min(max, Math.max(min, n)) },
    }));
  return {
    servings,
    base,
    multiplier,
    // ×½ ↔ ×1 is the only step that is not a whole one
    less: () => set(servings <= 1 ? MIN_MULTIPLIER : servings - 1),
    more: () => set(servings < 1 ? 1 : servings + 1),
    canLess: servings > min,
    canMore: servings < max,
  };
}

/** Crossed-out ingredients for a recipe; never saved, only kept for this tab. */
export function useCrossed(recipeId: number) {
  const { sessions, updateSession } = useCooking();
  const crossed = sessions[recipeId]?.crossed ?? {};
  return {
    isCrossed: (id: number) => !!crossed[id],
    toggle: (id: number) =>
      updateSession(recipeId, (s) => ({ ...s, crossed: { ...s.crossed, [id]: !s.crossed[id] } })),
  };
}
