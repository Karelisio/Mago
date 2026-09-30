import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ListRow, ListType } from '../lib/database.types';
import { readQueue } from '../lib/offlineQueue';
import { useSync } from '../contexts/SyncContext';
import { useAuth } from '../contexts/AuthContext';

const LISTS_KEY = ['lists'] as const;

function byCreatedAt(a: ListRow, b: ListRow) {
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

export function useLists() {
  const queryClient = useQueryClient();
  const { enqueue, discard } = useSync();
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
    return newList;
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

  // Suppression définitive (items en cascade), réservée au/à la propriétaire
  // (policy lists_delete). Pas de file de sync : il faut le réseau. Pour
  // un·e autre membre, RLS filtre le DELETE sans erreur (0 ligne) : sans le
  // .select('id') la liste disparaissait localement puis revenait.
  async function deleteList(list: ListRow): Promise<{ error: string | null }> {
    if (!session) return { error: 'Non connecté' };
    if (list.owner_id !== session.user.id) {
      return { error: 'Seule la personne qui a créé cette liste peut la supprimer.' };
    }
    patchCache((lists) => lists.filter((l) => l.id !== list.id));
    const fail = (error: string) => {
      patchCache((lists) => (lists.some((l) => l.id === list.id) ? lists : [...lists, list].sort(byCreatedAt)));
      return { error };
    };
    if (!navigator.onLine) return fail('Hors ligne : la suppression d’une liste demande une connexion.');

    async function deleteOnServer(): Promise<number> {
      const { data, error } = await supabase.from('lists').delete().eq('id', list.id).select('id');
      if (error) throw error;
      return (data ?? []).length;
    }

    try {
      if ((await deleteOnServer()) === 0) {
        // Rien de supprimé côté serveur : liste créée hors ligne dont la
        // création attend encore dans la file (on l'y retire, suppression
        // purement locale), ou refus RLS. Si l'envoi de la création était en
        // cours, discard() attend son issue et un second essai la supprime.
        const removed = await discard([{ table: 'lists', id: list.id }]);
        if (!removed.has(list.id) && (await deleteOnServer()) === 0) {
          void queryClient.invalidateQueries({ queryKey: LISTS_KEY });
          return fail('Cette liste n’a pas pu être supprimée : seule la personne qui l’a créée peut le faire.');
        }
      }
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
      return fail(`Suppression impossible : ${message}`);
    }

    // Écritures encore en attente sur la liste ou ses articles : la file les
    // renverrait, et une ligne complète absente du serveur est réinsérée
    // (la liste serait recréée).
    const leftovers = (await readQueue()).filter(
      (q) => (q.table === 'lists' && q.row.id === list.id) || (q.table === 'items' && q.row.list_id === list.id),
    );
    if (leftovers.length > 0) await discard(leftovers.map((q) => ({ table: q.table, id: q.row.id })));
    queryClient.removeQueries({ queryKey: ['items', list.id] });
    return { error: null };
  }

  return { ...query, createList, renameList, deleteList, swapPositions };
}
