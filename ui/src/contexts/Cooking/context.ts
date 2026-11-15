import { createContext } from 'react';

export type TimerState = {
  total: number;
  /** seconds left while paused/idle; ignored while running (endAt is the truth then) */
  left: number;
  /** wall-clock end while running — counting from it, not from ticks, survives throttled tabs */
  endAt: number | null;
  done: boolean;
};

/** Per-recipe state that lives as long as the tab: shared by the recipe page and cook mode. */
export type RecipeSession = {
  servings?: number;
  /** crossed-out ingredient rows, by ingredient id */
  crossed: Record<number, boolean>;
};

export type CookingContextValue = {
  timers: Record<string, TimerState>;
  now: number;
  setTimer: (key: string, state: TimerState) => void;
  startTimer: (key: string, state: TimerState) => void;
  sessions: Record<number, RecipeSession>;
  updateSession: (recipeId: number, update: (s: RecipeSession) => RecipeSession) => void;
};

export const CookingContext = createContext<CookingContextValue | null>(null);
