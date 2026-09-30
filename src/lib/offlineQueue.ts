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
  // Échecs définitifs déjà constatés pour CETTE version (voir
  // recordFailedAttempt). Absent = 0 : entrées du widget ou d'une ancienne
  // version de l'app. Remis à zéro à chaque nouvelle version (nouvelle entrée
  // côté JS, champ retiré par la fusion du widget).
  attempts?: number;
}

// Au MAX_SYNC_ATTEMPTS-ième échec définitif d'une même version, l'entrée est
// abandonnée (journalisée) : sinon elle restait en file à vie, renvoyée à
// chaque flush (« En attente (n) » permanent).
export const MAX_SYNC_ATTEMPTS = 3;

// Erreur Postgres qui se reproduira à l'identique en renvoyant la même
// ligne : contrainte d'intégrité (classe 23 : clé étrangère 23503, doublon
// 23505…) ou refus d'une policy RLS (42501 « row-level security » — pas un
// 42501 « permission denied » dû à un GRANT manquant, qu'une migration
// corrigera). Une erreur réseau (pas de code Postgres) ou de schéma
// (PGRST…) ne compte jamais.
export function isPermanentSyncError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (typeof code !== 'string') return false;
  if (code.startsWith('23')) return true;
  return code === '42501' && typeof message === 'string' && /row-level security/i.test(message);
}

// Un article dont la liste attend encore son propre envoi (créée hors ligne)
// échoue en FK/RLS tant qu'elle n'est pas arrivée : ça ne compte pas.
export function countsAsFailedAttempt(entry: QueueEntry, err: unknown, queue: QueueEntry[]): boolean {
  if (!isPermanentSyncError(err)) return false;
  const listId = entry.row.list_id;
  if (entry.table === 'items' && typeof listId === 'string') {
    return !queue.some((q) => q.table === 'lists' && q.row.id === listId);
  }
  return true;
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

// Une nouvelle version d'une ligne déjà en file la remplace SUR PLACE : la
// file est envoyée dans l'ordre, et une liste créée hors ligne puis
// renommée/déplacée doit rester devant ses articles (sinon leur insert
// échoue, FK/RLS, tant que la liste n'existe pas côté serveur). Même règle
// côté widget (MagoWidgetProvider.enqueueForSync).
export function enqueueEntry(entry: QueueEntry): Promise<QueueEntry[]> {
  return withLock(async () => {
    const queue = await readQueueRaw();
    const index = queue.findIndex((q) => isSameRow(q, entry.table, entry.row.id));
    const next =
      index === -1
        ? [...queue, entry]
        : [
            ...queue.slice(0, index),
            entry,
            ...queue.slice(index + 1).filter((q) => !isSameRow(q, entry.table, entry.row.id)),
          ];
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

// Compte un échec de la version envoyée (si countsAsFailedAttempt) ; au
// MAX_SYNC_ATTEMPTS-ième, l'entrée est retirée (dropped). Une version plus
// récente mise en file pendant l'envoi n'est pas concernée (elle repart de 0).
export function recordFailedAttempt(
  entry: QueueEntry,
  version: string,
  err: unknown,
): Promise<{ counted: boolean; dropped: boolean; queue: QueueEntry[] }> {
  return withLock(async () => {
    const queue = await readQueueRaw();
    const index = queue.findIndex((q) => isSameRow(q, entry.table, entry.row.id) && entryVersion(q) === version);
    if (index === -1 || !countsAsFailedAttempt(queue[index], err, queue)) {
      return { counted: false, dropped: false, queue };
    }
    const attempts = (Number(queue[index].attempts) || 0) + 1;
    const dropped = attempts >= MAX_SYNC_ATTEMPTS;
    const next = dropped
      ? queue.filter((_, i) => i !== index)
      : queue.map((q, i) => (i === index ? { ...q, attempts } : q));
    await writeQueueRaw(next);
    return { counted: true, dropped, queue: next };
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
