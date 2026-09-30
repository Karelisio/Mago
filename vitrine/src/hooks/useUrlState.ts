import { useCallback, useEffect, useRef, useState } from 'react';
import { parseUrlState, serializeUrlState, type UrlState } from '../lib/url';

const SHEET_ENTRY = 'vitrine-sheet';

/**
 * Filtres et changelog ouvert, synchronisés avec l'URL. Les filtres remplacent
 * l'entrée d'historique courante ; ouvrir un changelog en ajoute une, pour que
 * « Retour » (geste Android compris) le referme au lieu de quitter la page.
 */
export function useUrlState() {
  const [state, setState] = useState<UrlState>(() => parseUrlState(window.location.search));
  const current = useRef(state);

  useEffect(() => {
    const onPopState = () => {
      current.current = parseUrlState(window.location.search);
      setState(current.current);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const write = useCallback((next: UrlState, push: boolean) => {
    current.current = next;
    const { pathname, search, hash } = window.location;
    const url = `${pathname}${serializeUrlState(next, search)}${hash}`;
    if (push) window.history.pushState({ [SHEET_ENTRY]: true }, '', url);
    else window.history.replaceState(window.history.state, '', url);
    setState(next);
  }, []);

  const update = useCallback((patch: Partial<UrlState>) => write({ ...current.current, ...patch }, false), [write]);

  const openSheet = useCallback(
    (repo: string, tag: string | null = null) => {
      const alreadyOpen = current.current.repo !== null;
      write({ ...current.current, repo, tag }, !alreadyOpen);
    },
    [write],
  );

  const closeSheet = useCallback(() => {
    if (current.current.repo === null) return;
    // Entrée ajoutée par openSheet : on la dépile (popstate mettra l'état à jour).
    if ((window.history.state as Record<string, unknown> | null)?.[SHEET_ENTRY]) window.history.back();
    else write({ ...current.current, repo: null, tag: null }, false);
  }, [write]);

  return { state, update, openSheet, closeSheet };
}
