import { useEffect, useRef } from 'react';

/**
 * Calls `onVisible` when the returned ref's element comes within `rootMargin` of the viewport.
 * Toggling `enabled` re-creates the observer, which reports the current state at once — so after
 * a page loads, a sentinel that is still on screen (a short list, a tall window) fires again.
 */
export function useOnVisible<T extends Element>(
  onVisible: () => void,
  { enabled = true, rootMargin = '600px' }: { enabled?: boolean; rootMargin?: string } = {},
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && onVisible(),
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, onVisible, rootMargin]);

  return ref;
}
