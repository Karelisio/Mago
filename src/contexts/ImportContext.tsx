import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { parseImportUrl, type ImportPayload } from '../lib/externalImport';

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

// Au démarrage à froid, getLaunchUrl() et appUrlOpen peuvent livrer la même
// URL : on ignore un doublon reçu dans la foulée, sans empêcher de rouvrir
// volontairement le même lien plus tard.
const DUPLICATE_WINDOW_MS = 3000;

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
  const [pending, setPending] = useState<ImportPayload | null>(null);
  const [pendingId, setPendingId] = useState(0);
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const lastHandled = useRef<{ url: string; at: number } | null>(null);
  const snackbarSeq = useRef(0);

  const showSnackbar = useCallback((message: string, action?: SnackbarState['action']) => {
    snackbarSeq.current += 1;
    setSnackbar({ id: snackbarSeq.current, message, action });
  }, []);

  const handleUrl = useCallback(
    (url: string) => {
      const result = parseImportUrl(url);
      if (!result) return;
      const now = Date.now();
      if (lastHandled.current && lastHandled.current.url === url && now - lastHandled.current.at < DUPLICATE_WINDOW_MS) {
        return;
      }
      lastHandled.current = { url, at: now };
      if (result.ok) {
        setPending(result.payload);
        setPendingId((id) => id + 1);
      } else {
        showSnackbar(`Import refusé : ${result.error}`);
      }
    },
    [showSnackbar],
  );

  useEffect(() => {
    if (initialWebUrl) handleUrl(initialWebUrl);
    if (!Capacitor.isNativePlatform()) return;

    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) handleUrl(launch.url);
    });
    const listenerPromise = App.addListener('appUrlOpen', ({ url }) => handleUrl(url));
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [handleUrl, initialWebUrl]);

  return (
    <ImportContext.Provider
      value={{
        pending,
        pendingId,
        clearPending: () => setPending(null),
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
