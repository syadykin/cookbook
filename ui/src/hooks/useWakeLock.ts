import { useEffect } from 'react';

/**
 * Keeps the screen on while `enabled`. The browser drops the lock whenever the page is hidden,
 * so it is requested again on every return to the tab. Needs HTTPS; silently does nothing
 * where unsupported.
 */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) {
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) {
        return;
      }
      navigator.wakeLock
        .request('screen')
        .then((s) => {
          if (cancelled) {
            void s.release();
          } else {
            sentinel = s;
          }
        })
        .catch(() => {
          // denied (battery saver, no permission): the toggle just has no effect
        });
    };

    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', request);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
