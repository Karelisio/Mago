import { Preferences } from '@capacitor/preferences';

const QUEUE_KEY = 'mago_sync_queue_v1';

export type QueueTable = 'items' | 'lists';

export interface QueueEntry {
  table: QueueTable;
  row: Record<string, unknown> & { id: string; updated_at: string };
  enqueuedAt: string;
}

export async function readQueue(): Promise<QueueEntry[]> {
  const { value } = await Preferences.get({ key: QUEUE_KEY });
  if (!value) return [];
  try {
    return JSON.parse(value) as QueueEntry[];
  } catch {
    return [];
  }
}

export async function writeQueue(queue: QueueEntry[]): Promise<void> {
  await Preferences.set({ key: QUEUE_KEY, value: JSON.stringify(queue) });
}

export async function enqueueEntry(entry: QueueEntry): Promise<QueueEntry[]> {
  const queue = await readQueue();
  const withoutStale = queue.filter((q) => !(q.table === entry.table && q.row.id === entry.row.id));
  const next = [...withoutStale, entry];
  await writeQueue(next);
  return next;
}

export async function removeEntry(table: QueueTable, id: string): Promise<QueueEntry[]> {
  const queue = await readQueue();
  const next = queue.filter((q) => !(q.table === table && q.row.id === id));
  await writeQueue(next);
  return next;
}
