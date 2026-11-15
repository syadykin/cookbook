import { type ReactNode, useEffect, useRef, useState } from 'react';

import { ring, unlockAudio } from './alarm';
import { CookingContext, type RecipeSession, type TimerState } from './context';

const TICK_MS = 250;
const ALARM_EVERY_MS = 4000;
const ALARM_MAX = 8;

/**
 * Holds step timers and per-recipe cooking state above the router, so a timer started on the
 * recipe page keeps running (and ringing) in cook mode and back. Several timers may run at once.
 */
export function CookingProvider({ children }: { children: ReactNode }) {
  const [timers, setTimers] = useState<Record<string, TimerState>>({});
  const [sessions, setSessions] = useState<Record<number, RecipeSession>>({});
  const [now, setNow] = useState(() => Date.now());
  const alarm = useRef({ last: 0, count: 0 });

  const active = Object.values(timers).some((t) => t.endAt !== null || t.done);

  useEffect(() => {
    if (!active) {
      return;
    }
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      setTimers((cur) => {
        let changed = false;
        const next: Record<string, TimerState> = {};
        for (const [k, x] of Object.entries(cur)) {
          if (x.endAt !== null && t >= x.endAt) {
            next[k] = { total: x.total, left: 0, endAt: null, done: true };
            changed = true;
          } else {
            next[k] = x;
          }
        }
        return changed ? next : cur;
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);

  const anyDone = Object.values(timers).some((t) => t.done);
  useEffect(() => {
    if (!anyDone) {
      return;
    }
    // repeats until every finished timer is acknowledged, but gives up after ALARM_MAX rings
    const a = alarm.current;
    if (now - a.last >= ALARM_EVERY_MS && a.count < ALARM_MAX) {
      a.last = now;
      a.count += 1;
      ring();
    }
  }, [anyDone, now]);

  const value = {
    timers,
    now,
    setTimer: (key: string, state: TimerState) => setTimers((cur) => ({ ...cur, [key]: state })),
    startTimer: (key: string, state: TimerState) => {
      unlockAudio();
      alarm.current = { last: 0, count: 0 };
      setNow(Date.now());
      setTimers((cur) => ({ ...cur, [key]: state }));
    },
    sessions,
    updateSession: (recipeId: number, update: (s: RecipeSession) => RecipeSession) =>
      setSessions((cur) => ({ ...cur, [recipeId]: update(cur[recipeId] ?? { crossed: {} }) })),
  };

  return <CookingContext value={value}>{children}</CookingContext>;
}
