import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { parseImportUrl, type ImportPayload } from '../lib/externalImport';
import { createLinkGate, linkKey, rememberLink } from '../lib/handledLinks';

export interface SnackbarState {
  id: number;
  message: string;
  action?: { label: string; onPress: () => void };
}

interface ImportContextValue {
  pending: ImportPayload | null;
  // Change à chaque nouvel import reçu : sert de clé pour réinitialiser
  // l'écran de confirmation même si deux imports se ressemblent.
  pendingId: number;
  clearPending: () => void;
  snackbar: SnackbarState | null;
  showSnackbar: (message: string, action?: SnackbarState['action']) => void;
  hideSnackbar: () => void;
}

const ImportContext = createContext<ImportContextValue | undefined>(undefined);

// Pratique pour tester dans un navigateur : /import?data=<base64url>. Lu
// pendant le rendu initial (useState) : dans un effet, la route catch-all
// (<Navigate> dans App.tsx, dont l'effet passe avant le nôtre) aurait déjà
// redirigé vers /lists.
function initialWebImportUrl(): string | null {
  if (Capacitor.isNativePlatform() || window.location.pathname !== '/import') return null;
  const data = new URLSearchParams(window.location.search).get('data');
  return data ? `mago://import?data=${data}` : 'mago://import';
}

export function ImportProvider({ children }: { children: ReactNode }) {
  const [initialWebUrl] = useState(initialWebImportUrl);
  // key : empreinte de l'URL reçue, mémorisée une fois l'import traité.
  const [pending, setPending] = useState<{ payload: ImportPayload; key: string } | null>(null);
  const [pendingId, setPendingId] = useState(0);
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const snackbarSeq = useRef(0);

  const showSnackbar = useCallback((message: string, action?: SnackbarState['action']) => {
    snackbarSeq.current += 1;
    setSnackbar({ id: snackbarSeq.current, message, action });
  }, []);

  // Reçu au lancement (getLaunchUrl, URL web initiale) ou app ouverte
  // (appUrlOpen). Un import déjà traité et relivré au démarrage (rejeu de
  // l'intent de lancement, voir handledLinks.ts) est ignoré ; un lien reçu
  // app ouverte est toujours une nouvelle demande.
  useEffect(() => {
    const shouldIgnore = createLinkGate();
    async function receive(url: string, fromLaunch: boolean) {
      const result = parseImportUrl(url);
      if (!result || (await shouldIgnore(url, fromLaunch))) return;
      const key = linkKey(url);
      if (result.ok) {
        setPending({ payload: result.payload, key });
        setPendingId((id) => id + 1);
      } else {
        void rememberLink(key);
        showSnackbar(`Import refusé : ${result.error}`);
      }
    }

    if (initialWebUrl) void receive(initialWebUrl, true);
    if (!Capacitor.isNativePlatform()) return;

    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) void receive(launch.url, true);
    });
    const listenerPromise = App.addListener('appUrlOpen', ({ url }) => void receive(url, false));
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [initialWebUrl, showSnackbar]);

  // Import traité (appliqué, annulé ou abandonné) : mémorisé, pour ne plus
  // jamais le réappliquer s'il est relivré au lancement.
  const clearPending = useCallback(() => {
    const current = pendingRef.current;
    if (current) void rememberLink(current.key);
    setPending(null);
  }, []);

  return (
    <ImportContext.Provider
      value={{
        pending: pending?.payload ?? null,
        pendingId,
        clearPending,
        snackbar,
        showSnackbar,
        hideSnackbar: () => setSnackbar(null),
      }}
    >
      {children}
    </ImportContext.Provider>
  );
}

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error('useImport doit être utilisé dans un ImportProvider');
  return ctx;
}
