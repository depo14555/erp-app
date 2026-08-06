import { useState, useEffect } from 'react';

/** Реактивний matchMedia: використовується для вибору десктопного флоу
 *  (матриця проєкту замість списку машин) — сам лейаут адаптується CSS-ом. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

export const DESKTOP_QUERY = '(min-width: 1024px)';
