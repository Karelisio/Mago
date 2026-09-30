import {
  DynamicScheme,
  Hct,
  SchemeExpressive,
  SchemeNeutral,
  SchemeTonalSpot,
  SchemeVibrant,
  argbFromHex,
  hexFromArgb,
} from '@material/material-color-utilities';

// Palette Material You (spec 2025, « Material 3 Expressive ») générée depuis une
// seule couleur source. Module pur : utilisé au runtime ET par vite.config.ts
// pour injecter la palette par défaut dans index.html (pas de flash au chargement).

export type PaletteStyle = 'vibrant' | 'tonalSpot' | 'expressive' | 'neutral';
export type ThemeMode = 'dark' | 'light';

export const PALETTE_STYLES: readonly PaletteStyle[] = ['vibrant', 'tonalSpot', 'expressive', 'neutral'];

type SchemeCtor = new (
  source: Hct,
  isDark: boolean,
  contrastLevel: number,
  specVersion?: '2021' | '2025',
  platform?: 'phone' | 'watch',
) => DynamicScheme;

const SCHEMES: Record<PaletteStyle, SchemeCtor> = {
  vibrant: SchemeVibrant,
  tonalSpot: SchemeTonalSpot,
  expressive: SchemeExpressive,
  neutral: SchemeNeutral,
};

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

export function makeScheme(seed: string, isDark: boolean, style: PaletteStyle = 'vibrant'): DynamicScheme {
  const Scheme = SCHEMES[style] ?? SchemeVibrant;
  return new Scheme(Hct.fromInt(argbFromHex(seed)), isDark, 0, '2025', 'phone');
}

/** Rôles de couleur exposés en variables CSS `--md-<role>` (kebab-case). */
export const SYSTEM_ROLES = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'surface',
  'surfaceDim',
  'surfaceBright',
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'onSurface',
  'onSurfaceVariant',
  'outline',
  'outlineVariant',
  'inverseSurface',
  'inverseOnSurface',
  'inversePrimary',
  'scrim',
  'shadow',
] as const satisfies readonly (keyof DynamicScheme)[];

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

export function systemColors(seed: string, mode: ThemeMode, style: PaletteStyle): Record<SystemRole, string> {
  const scheme = makeScheme(seed, mode === 'dark', style);
  const out = {} as Record<SystemRole, string>;
  for (const role of SYSTEM_ROLES) out[role] = hexFromArgb(scheme[role]);
  return out;
}

function declarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
}

/** Variables `--md-*` pour les deux modes, sélectionnés par `data-theme` sur <html>. */
export function themeCss(seed: string, style: PaletteStyle): string {
  return (['dark', 'light'] as const)
    .map((mode) => {
      const colors = systemColors(seed, mode, style);
      const vars = Object.fromEntries(Object.entries(colors).map(([role, hex]) => [`--md-${kebab(role)}`, hex]));
      return `:root[data-theme="${mode}"]{${declarations(vars)}}`;
    })
    .join('\n');
}

/** Couleurs d'accent d'un dépôt (dérivées de la couleur de son langage). */
export function accentColors(seed: string, mode: ThemeMode, style: PaletteStyle): Record<string, string> {
  const s = makeScheme(seed, mode === 'dark', style);
  return {
    '--accent': hexFromArgb(s.primary),
    '--on-accent': hexFromArgb(s.onPrimary),
    '--accent-container': hexFromArgb(s.primaryContainer),
    '--on-accent-container': hexFromArgb(s.onPrimaryContainer),
    '--accent-soft': hexFromArgb(s.secondaryContainer),
    '--on-accent-soft': hexFromArgb(s.onSecondaryContainer),
    '--accent-surface': hexFromArgb(s.surfaceContainerLow),
    '--accent-surface-high': hexFromArgb(s.surfaceContainerHigh),
    '--accent-outline': hexFromArgb(s.outlineVariant),
  };
}

export interface AccentEntry {
  key: string;
  color: string;
}

/**
 * Une règle par accent et par mode : les cartes portent `data-accent="<key>"`,
 * la bascule clair/sombre ne demande donc aucun re-rendu React.
 */
export function accentCss(entries: readonly AccentEntry[], style: PaletteStyle): string {
  const rules: string[] = [];
  for (const { key, color } of entries) {
    if (!isHexColor(color) || !/^[a-z0-9-]+$/.test(key)) continue;
    for (const mode of ['dark', 'light'] as const) {
      rules.push(`:root[data-theme="${mode}"] [data-accent="${key}"]{${declarations(accentColors(color, mode, style))}}`);
    }
  }
  return rules.join('\n');
}

/** Pastille d'aperçu façon sélecteur de couleurs Android (primaire / secondaire / tertiaire). */
export function swatchColors(seed: string, mode: ThemeMode, style: PaletteStyle): [string, string, string] {
  const s = makeScheme(seed, mode === 'dark', style);
  return [hexFromArgb(s.primary), hexFromArgb(s.secondaryContainer), hexFromArgb(s.tertiary)];
}
