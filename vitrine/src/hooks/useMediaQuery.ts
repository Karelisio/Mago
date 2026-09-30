import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Pointeur précis avec survol (souris / trackpad) : active le tilt des cartes. */
export const useFinePointer = () => useMediaQuery('(hover: hover) and (pointer: fine)');
