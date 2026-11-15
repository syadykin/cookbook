import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** A mouse or trackpad: hidden controls reveal on hover, file pickers open directly. */
export const useFinePointer = () => useMediaQuery('(hover: hover) and (pointer: fine)');
