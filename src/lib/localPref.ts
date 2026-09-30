export const LAST_LIST_TYPE_KEY = 'mago:lastListType';
export const LAST_IMPORT_LIST_KEY = 'mago:lastImportListId';
export const IMPORT_AUTO_CONFIRM_KEY = 'mago:importAutoConfirm';
// Lien de connexion demandé depuis cet appareil : { at } (voir deeplink.ts).
export const PENDING_LOGIN_KEY = 'mago:pendingLogin';

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
