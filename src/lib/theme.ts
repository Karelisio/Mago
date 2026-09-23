import { getLocalPref, setLocalPref } from './localPref';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'mago:theme';
const listeners = new Set<(pref: ThemePreference) => void>();

export function getThemePreference(): ThemePreference {
  const value = getLocalPref(KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

// Utilisé par dynamicColor.ts : la préférence forcée doit gagner sur le
// système, sinon la palette Material You dynamique (qui lit le système)
// écraserait un thème forcé manuellement via les variables CSS.
export function isEffectiveDark(pref: ThemePreference): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyDataAttr(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function initTheme() {
  applyDataAttr(getThemePreference());
}

export function setThemePreference(pref: ThemePreference) {
  setLocalPref(KEY, pref);
  applyDataAttr(pref);
  listeners.forEach((fn) => fn(pref));
}

export function onThemeChange(fn: (pref: ThemePreference) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
