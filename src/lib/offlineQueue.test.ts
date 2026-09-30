import { beforeEach, describe, expect, it, vi } from 'vitest';

// @capacitor/preferences remplacé par un stockage en mémoire (même clé que
// l'app, pour pouvoir y écrire comme le fait le widget en natif).
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
  enqueueEntry,
  entryVersion,
  planFlushEntry,
  readEntry,
  readQueue,
  removeEntry,
  removeEntryIfUnchanged,
  type QueueEntry,
} from './offlineQueue';

const QUEUE_KEY = 'mago_sync_queue_v1';

function entry(id: string, version: string, extra: Partial<QueueEntry> = {}, row: Record<string, unknown> = {}): QueueEntry {
  return {
    table: 'items',
    row: { id, updated_at: '2026-01-01T10:00:00.000Z', ...row },
    enqueuedAt: '2026-01-01T10:00:00.000Z',
    version,
    ...extra,
  };
}

beforeEach(() => {
  store.clear();
});

describe('enqueueEntry', () => {
  it('remplace la version en attente de la même ligne et la place en fin de file', async () => {
    await enqueueEntry(entry('a', 'v1', {}, { completed: true }));
    await enqueueEntry(entry('b', 'v2'));
    const next = await enqueueEntry(entry('a', 'v3', {}, { completed: false }));

    expect(next.map((q) => [q.row.id, q.version])).toEqual([
      ['b', 'v2'],
      ['a', 'v3'],
    ]);
    expect(next[1].row.completed).toBe(false);
    expect(await readQueue()).toEqual(next);
  });

  it('ne confond pas deux tables pour un même id', async () => {
    await enqueueEntry(entry('x', 'v1'));
    const next = await enqueueEntry({ ...entry('x', 'v2'), table: 'lists' });
    expect(next).toHaveLength(2);
  });
});

describe('readEntry', () => {
  it('renvoie la version actuellement en file, ou undefined', async () => {
    await enqueueEntry(entry('a', 'v1'));
    await enqueueEntry(entry('a', 'v2'));

    expect((await readEntry('items', 'a'))?.version).toBe('v2');
    expect(await readEntry('lists', 'a')).toBeUndefined();
    expect(await readEntry('items', 'absent')).toBeUndefined();
  });
});

describe('removeEntryIfUnchanged', () => {
  it('retire la version envoyée si elle est toujours en file', async () => {
    await enqueueEntry(entry('a', 'v1'));
    await enqueueEntry(entry('b', 'v2'));

    const { removed, queue } = await removeEntryIfUnchanged('items', 'a', 'v1');
    expect(removed).toBe(true);
    expect(queue.map((q) => q.row.id)).toEqual(['b']);
    expect(await readQueue()).toEqual(queue);
  });

  it('conserve une version plus récente mise en file pendant l’envoi', async () => {
    await enqueueEntry(entry('a', 'v1', {}, { completed: true }));
    // Envoi de v1 en cours… l'utilisateur décoche : v2 remplace v1.
    await enqueueEntry(entry('a', 'v2', {}, { completed: false }));

    const { removed, queue } = await removeEntryIfUnchanged('items', 'a', 'v1');
    expect(removed).toBe(false);
    expect(queue).toHaveLength(1);
    expect((await readEntry('items', 'a'))?.row.completed).toBe(false);
  });

  it("ne fait rien si l'entrée a été annulée entre-temps", async () => {
    await enqueueEntry(entry('a', 'v1'));
    await removeEntry('items', 'a');

    const { removed, queue } = await removeEntryIfUnchanged('items', 'a', 'v1');
    expect(removed).toBe(false);
    expect(queue).toEqual([]);
  });

  it('se replie sur enqueuedAt pour une entrée sans version (ancienne app ou ancien widget)', async () => {
    const legacy: QueueEntry = {
      table: 'items',
      row: { id: 'a', updated_at: '2026-01-01T10:00:00.000Z' },
      enqueuedAt: '2026-01-01T10:00:01.000Z',
    };
    store.set(QUEUE_KEY, JSON.stringify([legacy]));
    expect(entryVersion(legacy)).toBe('2026-01-01T10:00:01.000Z');

    expect((await removeEntryIfUnchanged('items', 'a', 'autre')).removed).toBe(false);
    expect((await removeEntryIfUnchanged('items', 'a', entryVersion(legacy))).removed).toBe(true);
    expect(await readQueue()).toEqual([]);
  });

  it('conserve une entrée remplacée en natif par le widget (nouvelle version)', async () => {
    await enqueueEntry(entry('a', 'v1', {}, { name: 'Lait', completed: false }));
    // Fusion faite par MagoWidgetProvider.enqueueForSync : même ligne, patch
    // fusionné, nouvelle version.
    const [sent] = await readQueue();
    store.set(
      QUEUE_KEY,
      JSON.stringify([{ ...sent, row: { ...sent.row, completed: true }, version: 'natif-2', enqueuedAt: 'plus tard' }]),
    );

    expect((await removeEntryIfUnchanged('items', 'a', entryVersion(sent))).removed).toBe(false);
    expect((await readEntry('items', 'a'))?.row).toMatchObject({ name: 'Lait', completed: true });
  });
});

describe('removeEntry', () => {
  it('retire quelle que soit la version et dit si elle était encore en file', async () => {
    await enqueueEntry(entry('a', 'v1'));

    expect((await removeEntry('items', 'a')).removed).toBe(true);
    expect((await removeEntry('items', 'a')).removed).toBe(false);
  });
});

describe('planFlushEntry', () => {
  const local = entry('a', 'v1', {}, { updated_at: '2026-01-01T10:00:05.000Z', completed: true });

  it('insère une ligne complète absente du serveur', () => {
    expect(planFlushEntry(local, null)).toEqual({ kind: 'insert', row: local.row });
  });

  it('abandonne un patch dont la ligne est absente du serveur (jamais d’insert incomplet)', () => {
    expect(planFlushEntry({ ...local, patch: true }, null)).toEqual({ kind: 'drop' });
  });

  it('met à jour si le serveur n’est pas plus récent', () => {
    expect(planFlushEntry(local, { updated_at: '2026-01-01T10:00:00+00:00' })).toEqual({ kind: 'update', row: local.row });
    expect(planFlushEntry(local, { updated_at: '2026-01-01T10:00:05+00:00' }).kind).toBe('update');
  });

  it('abandonne la version locale si le serveur a été modifié après', () => {
    expect(planFlushEntry(local, { updated_at: '2026-01-01T10:00:09+00:00' })).toEqual({ kind: 'skip' });
    expect(planFlushEntry({ ...local, patch: true }, { updated_at: '2026-01-01T10:00:09+00:00' })).toEqual({
      kind: 'skip',
    });
  });

  it('un patch ne met à jour que ses propres colonnes', () => {
    const patch: QueueEntry = {
      ...entry('a', 'v1'),
      row: { id: 'a', list_id: 'l', completed: true, last_modified_by: 'u', updated_at: '2026-01-01T10:00:05.000Z' },
      patch: true,
    };
    const action = planFlushEntry(patch, { updated_at: '2026-01-01T10:00:00+00:00' });
    expect(action.kind).toBe('update');
    expect(action.kind === 'update' && Object.keys(action.row).sort()).toEqual([
      'completed',
      'id',
      'last_modified_by',
      'list_id',
      'updated_at',
    ]);
  });

  it('ne prend pas notre propre écriture (heure serveur) pour une modification plus récente', () => {
    // Cocher (envoyé, le trigger pose updated_at = heure serveur 10:00:06)
    // puis décocher à 10:00:05 à l'heure du téléphone, pendant l'envoi.
    const ownWrite = '2026-01-01T10:00:06.123456+00:00';
    expect(planFlushEntry(local, { updated_at: ownWrite })).toEqual({ kind: 'skip' });
    expect(planFlushEntry(local, { updated_at: ownWrite }, ownWrite)).toEqual({ kind: 'update', row: local.row });
    // Quelqu'un d'autre a écrit depuis notre écriture : comparaison normale.
    expect(planFlushEntry(local, { updated_at: '2026-01-01T10:00:07+00:00' }, ownWrite)).toEqual({ kind: 'skip' });
  });
});
