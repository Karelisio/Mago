import raw from '../config.json' with { type: 'json' };
import { PALETTE_STYLES, isHexColor, type PaletteStyle, type ThemeMode } from './lib/theme.ts';

// Réglages de config.json utiles au front (le reste ne sert qu'au script de
// récupération des données). Valeurs invalides ⇒ valeur par défaut.

export interface VitrineConfig {
  username: string;
  accentColor: string;
  paletteStyle: PaletteStyle;
  defaultTheme: ThemeMode;
  locale: string;
  title: string;
  description: string;
  timelineSize: number;
}

const r = raw as Partial<Record<keyof VitrineConfig, unknown>>;

const text = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const int = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

function validLocale(value: unknown): string {
  const locale = text(value, 'fr-FR');
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? 'fr-FR';
  } catch {
    return 'fr-FR';
  }
}

export const CONFIG: VitrineConfig = {
  username: text(r.username, 'octocat'),
  accentColor: isHexColor(r.accentColor) ? r.accentColor : '#7C5CFF',
  paletteStyle: PALETTE_STYLES.includes(r.paletteStyle as PaletteStyle) ? (r.paletteStyle as PaletteStyle) : 'vibrant',
  defaultTheme: r.defaultTheme === 'light' ? 'light' : 'dark',
  locale: validLocale(r.locale),
  title: text(r.title, 'Projets'),
  description: text(r.description, ''),
  timelineSize: int(r.timelineSize, 1, 30, 10),
};
