import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ListRow, ListType } from '../lib/database.types';
import { useSync } from '../contexts/SyncContext';
import { useAuth } from '../contexts/AuthContext';

const LISTS_KEY = ['lists'] as const;

export function useLists() {
  const queryClient = useQueryClient();
  const { enqueue } = useSync();
  const { session } = useAuth();

  const query = useQuery({
    queryKey: LISTS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as ListRow[];
    },
    enabled: !!session,
  });

  function patchCache(updater: (lists: ListRow[]) => ListRow[]) {
    queryClient.setQueryData<ListRow[]>(LISTS_KEY, (old) => updater(old ?? []));
  }

  async function createList(name: string, type: ListType, isPrivate = false) {
    if (!session) return;
    const now = new Date().toISOString();
    const siblings = (query.data ?? []).filter((l) => l.type === type);
    const position = siblings.length > 0 ? Math.max(...siblings.map((l) => l.position)) + 1 : 0;
    const newList: ListRow = {
      id: crypto.randomUUID(),
      name,
      type,
      position,
      is_private: isPrivate,
      owner_id: session.user.id,
      created_at: now,
      updated_at: now,
    };
    patchCache((lists) => [...lists, newList]);
    await enqueue('lists', newList as unknown as Record<string, unknown> & { id: string; updated_at: string });
  }

  // Échange la position de deux listes du même type (boutons monter/descendre
  // dans Lists.tsx) — pas de renumérotation globale, juste un swap entre
  // voisines dans le groupe affiché.
  async function swapPositions(a: ListRow, b: ListRow) {
    const now = new Date().toISOString();
    const updatedA: ListRow = { ...a, position: b.position, updated_at: now };
    const updatedB: ListRow = { ...b, position: a.position, updated_at: now };
    patchCache((lists) => lists.map((l) => (l.id === a.id ? updatedA : l.id === b.id ? updatedB : l)));
    await enqueue('lists', updatedA as unknown as Record<string, unknown> & { id: string; updated_at: string });
    await enqueue('lists', updatedB as unknown as Record<string, unknown> & { id: string; updated_at: string });
  }

  async function renameList(list: ListRow, name: string) {
    const updated: ListRow = { ...list, name, updated_at: new Date().toISOString() };
    patchCache((lists) => lists.map((l) => (l.id === list.id ? updated : l)));
    await enqueue('lists', updated as unknown as Record<string, unknown> & { id: string; updated_at: string });
  }

  async function deleteList(list: ListRow) {
    patchCache((lists) => lists.filter((l) => l.id !== list.id));
    const { error } = await supabase.from('lists').delete().eq('id', list.id);
    if (error) {
      // remise en cache si la suppression distante échoue (ex: offline)
      patchCache((lists) => [...lists, list]);
    }
  }

  return { ...query, createList, renameList, deleteList, swapPositions };
}
