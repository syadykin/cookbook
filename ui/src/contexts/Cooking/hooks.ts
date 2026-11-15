import { useContext } from 'react';

import { MIN_SERVINGS, maxServings } from '@/lib/recipe';

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

/** Servings shown for a recipe (−/+), shared by the recipe page and cook mode. */
export function useServings(recipeId: number, base: number) {
  const { sessions, updateSession } = useCooking();
  const servings = sessions[recipeId]?.servings ?? base;
  const set = (n: number) =>
    updateSession(recipeId, (s) => ({
      ...s,
      servings: Math.min(maxServings(base), Math.max(MIN_SERVINGS, n)),
    }));
  return {
    servings,
    less: () => set(servings - 1),
    more: () => set(servings + 1),
    canLess: servings > MIN_SERVINGS,
    canMore: servings < maxServings(base),
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
