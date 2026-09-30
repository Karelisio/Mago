import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { CONFIG } from '../config';
import { isHexColor, themeCss, type ThemeMode } from '../lib/theme';

const THEME_KEY = 'vitrine:theme';
const ACCENT_KEY = 'vitrine:accent';
const ACCENT_CSS_KEY = 'vitrine:accent-css';
const RUNTIME_STYLE_ID = 'vitrine-theme-runtime';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible (navigation privée…) : le choix ne sera juste pas mémorisé.
  }
}

interface ThemeContextValue {
  mode: ThemeMode;
  /** Bascule clair/sombre ; `origin` = centre du dévoilement circulaire. */
  toggleMode: (origin?: { x: number; y: number }) => void;
  /** Couleur source de la palette (celle de config.json par défaut). */
  seed: string;
  isCustomSeed: boolean;
  setSeed: (hex: string | null) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function syncThemeColorMeta() {
  const surface = getComputedStyle(document.documentElement).getPropertyValue('--md-surface').trim();
  if (surface) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // index.html a déjà posé data-theme (choix mémorisé ou défaut de config.json).
  const [mode, setMode] = useState<ThemeMode>(() =>
    document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
  );
  const [customSeed, setCustomSeed] = useState<string | null>(() => {
    const saved = read(ACCENT_KEY);
    return isHexColor(saved) ? saved : null;
  });

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    write(THEME_KEY, mode);
    syncThemeColorMeta();
  }, [mode]);

  useLayoutEffect(() => {
    let style = document.getElementById(RUNTIME_STYLE_ID);
    if (!customSeed) {
      style?.remove();
      write(ACCENT_KEY, null);
      write(ACCENT_CSS_KEY, null);
    } else {
      const css = themeCss(customSeed, CONFIG.paletteStyle);
      if (!style) {
        style = document.createElement('style');
        style.id = RUNTIME_STYLE_ID;
        document.head.appendChild(style);
      }
      style.textContent = css;
      write(ACCENT_KEY, customSeed);
      write(ACCENT_CSS_KEY, css);
    }
    syncThemeColorMeta();
  }, [customSeed]);

  const toggleMode = useCallback(
    (origin?: { x: number; y: number }) => {
      const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
      const apply = () => flushSync(() => setMode(next));
      if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
        apply();
        return;
      }
      const x = origin?.x ?? window.innerWidth - 48;
      const y = origin?.y ?? 32;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const transition = document.startViewTransition(apply);
      transition.ready
        .then(() => {
          document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
            { duration: 560, easing: 'cubic-bezier(0.2, 0, 0, 1)', pseudoElement: '::view-transition-new(root)' },
          );
        })
        .catch(() => {});
    },
    [mode],
  );

  const setSeed = useCallback((hex: string | null) => {
    setCustomSeed(hex && isHexColor(hex) && hex.toLowerCase() !== CONFIG.accentColor.toLowerCase() ? hex : null);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, toggleMode, seed: customSeed ?? CONFIG.accentColor, isCustomSeed: customSeed !== null, setSeed }),
    [mode, toggleMode, customSeed, setSeed],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme doit être utilisé dans <ThemeProvider>');
  return ctx;
}
