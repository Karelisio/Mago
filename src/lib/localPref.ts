// localStorage peut lever (navigation privée, quota) : best-effort, jamais
// bloquant pour une simple préférence de confort (dernier type sélectionné).
export function getLocalPref(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function setLocalPref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignoré
  }
}
