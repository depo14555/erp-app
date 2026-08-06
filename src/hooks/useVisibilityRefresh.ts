// ================================================================
//  src/hooks/useVisibilityRefresh.ts
//  Тихе фонове дооновлення: коли користувач повертається на вкладку
//  браузера, викликаємо refresh — але не частіше, ніж раз на minGapMs.
// ================================================================

import { useEffect, useRef } from 'react';

export function useVisibilityRefresh(refresh: () => void, minGapMs = 60000) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const lastRun = useRef(Date.now());

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine) return;
      if (Date.now() - lastRun.current < minGapMs) return;
      lastRun.current = Date.now();
      refreshRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [minGapMs]);
}
