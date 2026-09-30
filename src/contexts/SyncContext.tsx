import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { App } from '@capacitor/app';
import { supabase } from '../lib/supabase';
import {
  readQueue,
  readEntry,
  enqueueEntry,
  removeEntry,
  removeEntryIfUnchanged,
  clearQueue,
  entryVersion,
  planFlushEntry,
  type QueueEntry,
  type QueueTable,
} from '../lib/offlineQueue';
import { logSyncError } from '../lib/syncErrorLog';
import { useAuth } from './AuthContext';

export type SyncStatus = 'synced' | 'pending' | 'offline';

interface SyncContextValue {
  status: SyncStatus;
  pendingCount: number;
  enqueue: (table: QueueTable, row: QueueEntry['row']) => Promise<void>;
  discard: (targets: { table: QueueTable; id: string }[]) => Promise<Set<string>>;
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

function rowKey(table: QueueTable, id: string) {
  return `${table}:${id}`;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const flushing = useRef(false);
  const pendingFlushRequested = useRef(false);
  // updated_at renvoyé par nos propres UPDATE, par ligne (voir planFlushEntry).
  const ownWrites = useRef(new Map<string, string>());
  // Entrée en cours d'envoi par flush() : discard() attend son issue pour
  // savoir si elle a atteint le serveur malgré son retrait de la file.
  const sending = useRef<{ key: string; reachedServer: Promise<boolean> } | null>(null);
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

  // Retour au premier plan : le widget a pu mettre des coches en file
  // directement en natif pendant que l'app était en arrière-plan, sans que
  // rien ne déclenche de flush côté JS.
  useEffect(() => {
    const listenerPromise = App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void readQueue().then((stored) => {
        setQueue(stored);
        if (stored.length > 0 && navigator.onLine) {
          void flush();
        }
      });
    });
    return () => {
      void listenerPromise.then((listener) => listener.remove());
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
    const entry: QueueEntry = { table, row, enqueuedAt: new Date().toISOString(), version: crypto.randomUUID() };
    const next = await enqueueEntry(entry);
    setQueue(next);
    if (navigator.onLine) {
      void flush();
    }
  }

  // Retire des écritures encore en attente (jamais envoyées au serveur) ;
  // renvoie les ids effectivement retirés, pour que l'appelant sache ce qui
  // avait déjà été synchronisé.
  async function discard(targets: { table: QueueTable; id: string }[]) {
    const removed = new Set<string>();
    for (const { table, id } of targets) {
      const key = rowKey(table, id);
      const sendingBefore = sending.current;
      const result = await removeEntry(table, id);
      if (!result.removed) continue;
      // Retirée de la file pendant que flush() l'envoyait : elle n'est
      // réellement annulée que si cet envoi n'aboutit pas.
      const inFlight = [sendingBefore, sending.current].find((s) => s?.key === key);
      if (inFlight && (await inFlight.reachedServer)) continue;
      removed.add(id);
    }
    setQueue(await readQueue());
    return removed;
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
    // Requêtes React Query à rafraîchir, invalidées une seule fois en fin de
    // flush plutôt qu'après chaque entrée envoyée.
    const touchedItemLists = new Set<string>();
    let touchedLists = false;
    try {
      do {
        pendingFlushRequested.current = false;
        const batch = await readQueue();

        for (const queued of batch) {
          if (!navigator.onLine) {
            setIsOnline(false);
            return;
          }

          // Relue juste avant l'envoi : depuis la lecture du lot, l'entrée a pu
          // être annulée (discard) — on la saute — ou remplacée par une version
          // plus récente, qui est alors celle envoyée.
          const entry = await readEntry(queued.table, queued.row.id);
          if (!entry) continue;
          const key = rowKey(entry.table, entry.row.id);
          const version = entryVersion(entry);
          let reachedServer = false;
          let settle: (reached: boolean) => void = () => undefined;
          sending.current = { key, reachedServer: new Promise<boolean>((resolve) => (settle = resolve)) };

          try {
            const { data: serverRow, error: selectError } = await supabase
              .from(entry.table)
              .select('updated_at')
              .eq('id', entry.row.id)
              .maybeSingle();
            if (selectError) throw selectError;

            const action = planFlushEntry(entry, serverRow, ownWrites.current.get(key));
            if (action.kind === 'insert') {
              // Volontairement pas de .upsert() : un INSERT ... ON CONFLICT DO UPDATE
              // exige que la policy RLS UPDATE soit aussi satisfaite même quand aucun
              // conflit n'a lieu. Pour une ligne toute neuve, cette policy dépend d'un
              // trigger (list_members) qui n'a pas encore tourné → RLS violation
              // systématique. On sait déjà si la ligne existe grâce au SELECT ci-dessus,
              // donc on choisit explicitement insert (policy INSERT) ou update
              // (policy UPDATE) au lieu de laisser Postgres exiger les deux. Pas de
              // .select() non plus sur l'insert, pour la même raison (RETURNING
              // soumis à la policy SELECT, qui dépend aussi de list_members).
              const { error } = await supabase.from(entry.table).insert(action.row);
              if (error) throw error;
            } else if (action.kind === 'update') {
              const { data: written, error } = await supabase
                .from(entry.table)
                .update(action.row)
                .eq('id', entry.row.id)
                .select('updated_at');
              if (error) throw error;
              const writtenAt = written?.[0]?.updated_at as string | undefined;
              if (writtenAt) ownWrites.current.set(key, writtenAt);
            } else if (action.kind === 'drop') {
              console.warn('Sync : patch abandonné, ligne absente du serveur', entry);
              void logSyncError(
                entry.table,
                entry.row.id,
                'Patch abandonné : ligne absente du serveur',
                undefined,
                session?.user.id,
              );
            }
            reachedServer = action.kind !== 'drop';

            const { removed, queue: next } = await removeEntryIfUnchanged(entry.table, entry.row.id, version);
            setQueue(next);
            // Remplacée pendant l'envoi : la nouvelle version part au passage suivant.
            if (!removed && next.some((q) => rowKey(q.table, q.row.id) === key)) {
              pendingFlushRequested.current = true;
            }

            if (entry.table === 'items') {
              const listId = entry.row.list_id as string | undefined;
              if (listId) touchedItemLists.add(listId);
            } else {
              touchedLists = true;
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
          } finally {
            sending.current = null;
            settle(reachedServer);
          }
        }
      } while (pendingFlushRequested.current);
    } finally {
      flushing.current = false;
      if (touchedLists) void queryClient.invalidateQueries({ queryKey: ['lists'] });
      for (const listId of touchedItemLists) {
        void queryClient.invalidateQueries({ queryKey: ['items', listId] });
      }
    }
  }

  async function resetQueue() {
    const empty = await clearQueue();
    setQueue(empty);
  }

  const status: SyncStatus = !isOnline ? 'offline' : queue.length > 0 ? 'pending' : 'synced';

  return (
    <SyncContext.Provider value={{ status, pendingCount: queue.length, enqueue, discard, flush, resetQueue }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync doit être utilisé dans un SyncProvider');
  return ctx;
}
