import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    },
  },
}));

import {
  addHandledKey,
  createLinkGate,
  LINK_DUPLICATE_WINDOW_MS,
  LINK_STARTUP_WINDOW_MS,
  linkKey,
  MAX_HANDLED_LINKS,
  rememberLink,
  wasLinkHandled,
} from './handledLinks';

beforeEach(() => {
  store.clear();
});

const A = 'mago://import?data=eyJ2ZXJzaW9uIjoxfQ';
const B = 'mago://import?data=eyJ2ZXJzaW9uIjoyfQ';

describe('linkKey', () => {
  it('est stable et distingue deux URL', () => {
    expect(linkKey(A)).toBe(linkKey(A));
    expect(linkKey(A)).not.toBe(linkKey(B));
    expect(linkKey(`${A}x`)).not.toBe(linkKey(A));
  });
});

describe('addHandledKey', () => {
  it('garde le plus récent en tête, sans doublon, avec une limite', () => {
    expect(addHandledKey(['b', 'a'], 'a')).toEqual(['a', 'b']);
    const many = Array.from({ length: MAX_HANDLED_LINKS }, (_, i) => `k${i}`);
    const next = addHandledKey(many, 'nouveau');
    expect(next).toHaveLength(MAX_HANDLED_LINKS);
    expect(next[0]).toBe('nouveau');
    expect(next).not.toContain(`k${MAX_HANDLED_LINKS - 1}`);
  });
});

describe('rememberLink / wasLinkHandled', () => {
  it('mémorise les liens traités, y compris en parallèle', async () => {
    expect(await wasLinkHandled(linkKey(A))).toBe(false);
    await Promise.all([rememberLink(linkKey(A)), rememberLink(linkKey(B))]);
    expect(await wasLinkHandled(linkKey(A))).toBe(true);
    expect(await wasLinkHandled(linkKey(B))).toBe(true);
  });

  it('résiste à un stockage illisible', async () => {
    store.set('mago_handled_links_v1', '{pas du json');
    expect(await wasLinkHandled(linkKey(A))).toBe(false);
    await rememberLink(linkKey(A));
    expect(await wasLinkHandled(linkKey(A))).toBe(true);
  });
});

describe('createLinkGate', () => {
  function clock(start = 1_000_000) {
    let t = start;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  }

  it('ignore la même URL livrée deux fois au démarrage à froid', async () => {
    const c = clock();
    const shouldIgnore = createLinkGate(c.now);
    const [first, second] = await Promise.all([shouldIgnore(A, true), shouldIgnore(A, false)]);
    expect([first, second]).toEqual([false, true]);
  });

  it('ignore au lancement un lien déjà traité (rejeu), jamais un lien reçu ensuite', async () => {
    await rememberLink(linkKey(A));
    const c = clock();
    const shouldIgnore = createLinkGate(c.now);
    // Rejeu : getLaunchUrl() ou appUrlOpen retenu, livré dès l'abonnement.
    expect(await shouldIgnore(A, true)).toBe(true);
    c.advance(LINK_DUPLICATE_WINDOW_MS);
    expect(await shouldIgnore(A, false)).toBe(true);
    // Plus tard, l'app déjà ouverte : nouvelle action volontaire.
    c.advance(LINK_STARTUP_WINDOW_MS);
    expect(await shouldIgnore(A, false)).toBe(false);
    // Un lien jamais traité passe toujours.
    expect(await shouldIgnore(B, true)).toBe(false);
  });

  it('relaisse passer la même URL après la fenêtre de doublon si elle n’a pas été traitée', async () => {
    const c = clock();
    const shouldIgnore = createLinkGate(c.now);
    expect(await shouldIgnore(A, true)).toBe(false);
    c.advance(LINK_DUPLICATE_WINDOW_MS + 1);
    expect(await shouldIgnore(A, true)).toBe(false);
  });
});
