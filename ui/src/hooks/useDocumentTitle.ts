import { useEffect } from 'react';

import { APP_NAME } from '@/components/Logo';

/** «Сирники — Їжак з макітрою» in the browser tab; the app name alone again once the page is left. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
