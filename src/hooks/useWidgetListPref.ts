import { useEffect, useState } from 'react';
import { getLocalPref, setLocalPref } from '../lib/localPref';

// Préférence par appareil (chaque partenaire peut vouloir une liste
// différente sur son propre écran d'accueil) — pas en base. localStorage
// seul ne déclenche pas de re-render dans le même document : ce petit
// pub-sub garde Settings.tsx (qui change la préférence) et useWidgetSync.ts
// (monté globalement dans App.tsx) synchronisés sans recharger l'app.
const KEY = 'mago:widgetListId';
const listeners = new Set<() => void>();

export function getWidgetListId(): string {
  return getLocalPref(KEY);
}

export function setWidgetListId(id: string) {
  setLocalPref(KEY, id);
  listeners.forEach((fn) => fn());
}

export function useWidgetListId(): string {
  const [id, setId] = useState(getWidgetListId);
  useEffect(() => {
    const listener = () => setId(getWidgetListId());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return id;
}
