import { Preferences } from '@capacitor/preferences';

const QUEUE_KEY = 'mago_sync_queue_v1';

export type QueueTable = 'items' | 'lists';

export interface QueueEntry {
  table: QueueTable;
  row: Record<string, unknown> & { id: string; updated_at: string };
  enqueuedAt: string;
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

export function enqueueEntry(entry: QueueEntry): Promise<QueueEntry[]> {
  return withLock(async () => {
    const queue = await readQueueRaw();
    const withoutStale = queue.filter((q) => !(q.table === entry.table && q.row.id === entry.row.id));
    const next = [...withoutStale, entry];
    await writeQueueRaw(next);
    return next;
  });
}

export function removeEntry(table: QueueTable, id: string): Promise<QueueEntry[]> {
  return withLock(async () => {
    const queue = await readQueueRaw();
    const next = queue.filter((q) => !(q.table === table && q.row.id === id));
    await writeQueueRaw(next);
    return next;
  });
}

export function clearQueue(): Promise<QueueEntry[]> {
  return withLock(async () => {
    await writeQueueRaw([]);
    return [];
  });
}
