import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { getThemePreference, isEffectiveDark, onThemeChange } from './theme';

// Icônes de la barre d'état assorties au thème EFFECTIF de l'app : un thème
// forcé dans Réglages doit gagner sur celui du système (sinon icônes
// sombres sur fond sombre, illisibles), et un changement de thème — système
// ou Réglages — s'applique tout de suite.
function applyStatusBarStyle() {
  const dark = isEffectiveDark(getThemePreference());
  // Style.Dark = icônes claires, pour un fond sombre.
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
}

export async function setupEdgeToEdge() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setBackgroundColor({ color: '#00000000' });
  } catch {
    // Plateforme sans StatusBar (web) ou plugin indisponible : on garde le layout par défaut.
    return;
  }
  applyStatusBarStyle();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyStatusBarStyle);
  onThemeChange(applyStatusBarStyle);
}
