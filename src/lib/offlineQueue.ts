import { Preferences } from '@capacitor/preferences';

const QUEUE_KEY = 'mago_sync_queue_v1';

export type QueueTable = 'items' | 'lists';

// Format partagé avec MagoWidgetProvider.kt (qui écrit directement dans cette
// file en natif) : tout changement ici doit y être répercuté.
export interface QueueEntry {
  table: QueueTable;
  row: Record<string, unknown> & { id: string; updated_at: string };
  enqueuedAt: string;
  // Identifiant unique (UUID) de cette mise en file, renouvelé à chaque
  // remplacement : flush() ne retire ainsi que la version qu'il a réellement
  // envoyée, jamais une version plus récente mise en file pendant la requête.
  // Absent des entrées écrites par une ancienne version de l'app ou du widget
  // (repli sur enqueuedAt, voir entryVersion()).
  version?: string;
  // Écriture partielle (coche depuis le widget : id, list_id, completed,
  // last_modified_by, updated_at) : seules ces colonnes sont mises à jour, et
  // elle est abandonnée si la ligne n'existe pas côté serveur (un insert
  // serait incomplet).
  patch?: boolean;
}

export function entryVersion(entry: QueueEntry): string {
  return entry.version ?? entry.enqueuedAt;
}

function isSameRow(entry: QueueEntry, table: QueueTable, id: string): boolean {
  return entry.table === table && entry.row.id === id;
}

// Toutes les lectures/écritures de la queue passent par ce mutex : deux appels
// concurrents (ex. créer une liste puis ajouter plusieurs articles très vite)
// ne doivent jamais faire un read-modify-write basé sur un état déjà périmé.
let mutex: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = mutex.then(fn, fn);
  mutex = result.catch(() => undefined);
  return result;
}

async function readQueueRaw(): Promise<QueueEntry[]> {
  const { value } = await Preferences.get({ key: QUEUE_KEY });
  if (!value) return [];
  try {
    return JSON.parse(value) as QueueEntry[];
  } catch {
    return [];
  }
}

async function writeQueueRaw(queue: QueueEntry[]): Promise<void> {
  await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(queue) });
}

export function readQueue(): Promise<QueueEntry[]> {
  return withLock(() => readQueueRaw());
}

// Version actuellement en file pour cette ligne (undefined si aucune).
export function readEntry(table: QueueTable, id: string): Promise<QueueEntry | undefined> {
  return withLock(async () => (await readQueueRaw()).find((q) => isSameRow(q, table, id)));
}

export function enqueueEntry(entry: QueueEntry): Promise<QueueEntry[]> {
  return withLock(async () => {
    const queue = await readQueueRaw();
    const withoutStale = queue.filter((q) => !isSameRow(q, entry.table, entry.row.id));
    const next = [...withoutStale, entry];
    await writeQueueRaw(next);
    return next;
  });
}

// Retire l'entrée quelle que soit sa version (annulation volontaire).
// `removed` indique si elle était encore en file au moment du retrait.
export function removeEntry(table: QueueTable, id: string): Promise<{ removed: boolean; queue: QueueEntry[] }> {
  return withLock(async () => {
    const queue = await readQueueRaw();
    const next = queue.filter((q) => !isSameRow(q, table, id));
    if (next.length === queue.length) return { removed: false, queue };
    await writeQueueRaw(next);
    return { removed: true, queue: next };
  });
}

// Retire l'entrée seulement si elle est toujours la version envoyée : une
// version plus récente, mise en file pendant la requête, reste en attente.
export function removeEntryIfUnchanged(
  table: QueueTable,
  id: string,
  version: string,
): Promise<{ removed: boolean; queue: QueueEntry[] }> {
  return withLock(async () => {
    const queue = await readQueueRaw();
    const next = queue.filter((q) => !(isSameRow(q, table, id) && entryVersion(q) === version));
    if (next.length === queue.length) return { removed: false, queue };
    await writeQueueRaw(next);
    return { removed: true, queue: next };
  });
}

export function clearQueue(): Promise<QueueEntry[]> {
  return withLock(async () => {
    await writeQueueRaw([]);
    return [];
  });
}

export type FlushAction =
  | { kind: 'insert' | 'update'; row: QueueEntry['row'] }
  // La ligne serveur a été modifiée après cette version locale (par
  // quelqu'un d'autre) : la version locale est abandonnée.
  | { kind: 'skip' }
  // Patch sur une ligne absente du serveur (supprimée, ou plus visible) :
  // rien à mettre à jour, et un insert serait incomplet.
  | { kind: 'drop' };

// Décision de flush() pour une entrée, d'après la ligne serveur (null si
// absente). ownWriteUpdatedAt : updated_at renvoyé par la dernière écriture
// de CET appareil sur cette ligne. Le trigger set_updated_at remplace
// updated_at par l'heure serveur à chaque UPDATE : sans ça, une version
// locale mise en file pendant notre propre envoi (cocher puis décocher vite)
// paraîtrait plus ancienne que notre propre écriture et serait abandonnée.
export function planFlushEntry(
  entry: QueueEntry,
  serverRow: { updated_at: string } | null,
  ownWriteUpdatedAt?: string,
): FlushAction {
  if (!serverRow) return entry.patch ? { kind: 'drop' } : { kind: 'insert', row: entry.row };
  const isOwnWrite = ownWriteUpdatedAt !== undefined && serverRow.updated_at === ownWriteUpdatedAt;
  if (!isOwnWrite && new Date(serverRow.updated_at) > new Date(entry.row.updated_at)) return { kind: 'skip' };
  // Pour un patch, row ne contient que les colonnes du patch.
  return { kind: 'update', row: entry.row };
}
