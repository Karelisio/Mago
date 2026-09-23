import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { readQueue, enqueueEntry, removeEntry, clearQueue, type QueueEntry, type QueueTable } from '../lib/offlineQueue';
import { logSyncError } from '../lib/syncErrorLog';
import { useAuth } from './AuthContext';

export type SyncStatus = 'synced' | 'pending' | 'offline';

interface SyncContextValue {
  status: SyncStatus;
  pendingCount: number;
  enqueue: (table: QueueTable, row: QueueEntry['row']) => Promise<void>;
  flush: () => Promise<void>;
  resetQueue: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [e.code, e.message, e.details, e.hint].filter(Boolean);
    if (parts.length > 0) return parts.join(' — ');
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const flushing = useRef(false);
  const pendingFlushRequested = useRef(false);
  const queryClient = useQueryClient();
  const { session } = useAuth();

  useEffect(() => {
    readQueue().then((initial) => {
      setQueue(initial);
      if (initial.length > 0 && navigator.onLine) {
        void flush();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void flush();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isOnline && queue.length > 0) {
      void flush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  async function enqueue(table: QueueTable, row: QueueEntry['row']) {
    const entry: QueueEntry = { table, row, enqueuedAt: new Date().toISOString() };
    const next = await enqueueEntry(entry);
    setQueue(next);
    if (navigator.onLine) {
      void flush();
    }
  }

  async function flush() {
    if (flushing.current) {
      // Un flush tourne déjà : on redemandera un passage complet dès qu'il aura fini,
      // pour ne jamais perdre silencieusement une entrée arrivée pendant qu'il tournait.
      pendingFlushRequested.current = true;
      return;
    }
    if (!navigator.onLine) return;
    flushing.current = true;
    try {
      do {
        pendingFlushRequested.current = false;
        let current = await readQueue();

        for (const entry of current) {
          if (!navigator.onLine) {
            setIsOnline(false);
            return;
          }

          try {
            const { data: serverRow, error: selectError } = await supabase
              .from(entry.table)
              .select('updated_at')
              .eq('id', entry.row.id)
              .maybeSingle();
            if (selectError) throw selectError;

            const serverIsNewer = serverRow && new Date(serverRow.updated_at) > new Date(entry.row.updated_at);

            if (!serverIsNewer) {
              const { error } = await supabase.from(entry.table).upsert(entry.row);
              if (error) throw error;
            }

            current = await removeEntry(entry.table, entry.row.id);
            setQueue(current);

            if (entry.table === 'items') {
              const listId = entry.row.list_id as string | undefined;
              if (listId) void queryClient.invalidateQueries({ queryKey: ['items', listId] });
            } else if (entry.table === 'lists') {
              void queryClient.invalidateQueries({ queryKey: ['lists'] });
            }
          } catch (err) {
            if (!navigator.onLine) {
              setIsOnline(false);
              return;
            }
            // On laisse cette entrée en queue pour un futur essai, mais on continue
            // les autres : une erreur isolée (ex. liste pas encore synchronisée pour
            // un de ses articles) ne doit pas bloquer le reste de la queue.
            const message = describeError(err);
            const rowOwnerId = (entry.row.owner_id ?? entry.row.added_by) as string | undefined;
            console.error('Sync flush failed for entry', entry, err);
            void logSyncError(entry.table, entry.row.id, message, rowOwnerId, session?.user.id);
          }
        }
      } while (pendingFlushRequested.current);
    } finally {
      flushing.current = false;
    }
  }

  async function resetQueue() {
    const empty = await clearQueue();
    setQueue(empty);
  }

  const status: SyncStatus = !isOnline ? 'offline' : queue.length > 0 ? 'pending' : 'synced';

  return (
    <SyncContext.Provider value={{ status, pendingCount: queue.length, enqueue, flush, resetQueue }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync doit être utilisé dans un SyncProvider');
  return ctx;
}
