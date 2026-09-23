import { registerPlugin, Capacitor } from '@capacitor/core';
import { getThemePreference, isEffectiveDark, onThemeChange } from './theme';

interface Palette {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
}

interface DynamicColorPlugin {
  getColors(): Promise<{ available: boolean; light?: Palette; dark?: Palette }>;
}

const DynamicColor = registerPlugin<DynamicColorPlugin>('DynamicColor');

const CSS_VAR_MAP: Record<keyof Palette, string> = {
  primary: '--md-primary',
  onPrimary: '--md-on-primary',
  primaryContainer: '--md-primary-container',
  onPrimaryContainer: '--md-on-primary-container',
  surfaceVariant: '--md-surface-variant',
  onSurfaceVariant: '--md-on-surface-variant',
  outline: '--md-outline',
};

function applyPalette(palette: Palette) {
  const root = document.documentElement;
  for (const key of Object.keys(CSS_VAR_MAP) as (keyof Palette)[]) {
    root.style.setProperty(CSS_VAR_MAP[key], palette[key]);
  }
}

export async function setupDynamicColor() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { available, light, dark } = await DynamicColor.getColors();
    if (!available || !light || !dark) return;

    // La préférence forcée (Réglages) doit gagner sur le système, sinon la
    // palette dynamique écraserait un thème forcé manuellement — voir
    // theme.ts.
    const apply = () => applyPalette(isEffectiveDark(getThemePreference()) ? dark : light);
    apply();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
    onThemeChange(apply);
  } catch {
    // Plugin indisponible (web, ou erreur native) : on garde la palette CSS fixe.
  }
}
