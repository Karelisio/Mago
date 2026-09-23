import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { readQueue, enqueueEntry, removeEntry, type QueueEntry, type QueueTable } from '../lib/offlineQueue';

export type SyncStatus = 'synced' | 'pending' | 'offline';

interface SyncContextValue {
  status: SyncStatus;
  pendingCount: number;
  enqueue: (table: QueueTable, row: QueueEntry['row']) => Promise<void>;
  flush: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const flushing = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    readQueue().then(setQueue);
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
    if (flushing.current) return;
    if (!navigator.onLine) return;
    flushing.current = true;
    try {
      let current = await readQueue();
      for (const entry of current) {
        try {
          const { data: serverRow } = await supabase
            .from(entry.table)
            .select('updated_at')
            .eq('id', entry.row.id)
            .maybeSingle();

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
            break;
          }
          console.error('Sync flush failed for entry', entry, err);
          break;
        }
      }
    } finally {
      flushing.current = false;
    }
  }

  const status: SyncStatus = !isOnline ? 'offline' : queue.length > 0 ? 'pending' : 'synced';

  return (
    <SyncContext.Provider value={{ status, pendingCount: queue.length, enqueue, flush }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync doit être utilisé dans un SyncProvider');
  return ctx;
}
