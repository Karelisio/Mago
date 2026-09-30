import { Preferences } from '@capacitor/preferences';

// Deep links déjà traités (import mago://import, retour de connexion),
// mémorisés d'un lancement à l'autre. App.getLaunchUrl() renvoie l'URL de
// lancement tant que l'activité vit (« Recharger l'app » après une erreur),
// et Android recrée l'activité avec son intent d'origine après la mort du
// processus (réouverture depuis les récents) — Capacitor la relivre alors
// aussi en appUrlOpen. Sans cette mémoire, un import déjà appliqué l'était
// une seconde fois (doublons, quantités additionnées deux fois).

const STORAGE_KEY = 'mago_handled_links_v1';
export const MAX_HANDLED_LINKS = 50;
// Au démarrage à froid, getLaunchUrl() et l'appUrlOpen retenu par Capacitor
// livrent la même URL coup sur coup.
export const LINK_DUPLICATE_WINDOW_MS = 3000;
// Seul un lien livré au lancement peut être un rejeu (l'appUrlOpen retenu
// arrive dès l'abonnement) ; un lien reçu ensuite (onNewIntent, app déjà
// ouverte) est toujours une nouvelle action : on ne l'ignore pas, même
// identique à un lien déjà traité.
export const LINK_STARTUP_WINDOW_MS = 5000;

// Empreinte courte (cyrb53, 53 bits + longueur) : inutile de stocker l'URL,
// qui peut peser des centaines de Ko pour un gros import.
export function linkKey(url: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < url.length; i++) {
    const ch = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `${url.length.toString(36)}-${hash.toString(36)}`;
}

// Plus récent en tête, sans doublon, MAX_HANDLED_LINKS au plus.
export function addHandledKey(keys: string[], key: string, max = MAX_HANDLED_LINKS): string[] {
  return [key, ...keys.filter((k) => k !== key)].slice(0, max);
}

async function readKeys(): Promise<string[]> {
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

export async function wasLinkHandled(key: string): Promise<boolean> {
  return (await readKeys()).includes(key);
}

let mutex: Promise<unknown> = Promise.resolve();

export function rememberLink(key: string): Promise<void> {
  const run = mutex.then(async () => {
    await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(addHandledKey(await readKeys(), key)) });
  });
  mutex = run.catch(() => undefined);
  return run;
}

// Filtre des deep links reçus par un contexte (import ou connexion), créé au
// moment de s'abonner : true = à ignorer (doublon immédiat de la même URL,
// ou rejeu au démarrage d'un lien déjà traité).
export function createLinkGate(now: () => number = Date.now) {
  const startedAt = now();
  let last: { url: string; at: number } | null = null;
  return async function shouldIgnore(url: string, fromLaunch: boolean): Promise<boolean> {
    const at = now();
    // Vérification synchrone avant tout await : deux livraisons dans le même
    // tour ne passent pas toutes les deux.
    if (last && last.url === url && at - last.at < LINK_DUPLICATE_WINDOW_MS) return true;
    last = { url, at };
    if (!fromLaunch && at - startedAt >= LINK_STARTUP_WINDOW_MS) return false;
    try {
      return await wasLinkHandled(linkKey(url));
    } catch {
      return false;
    }
  };
}
