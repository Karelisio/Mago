import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ItemRow, ListRow } from '../lib/database.types';
import { planImport, type ImportPayload, type ImportTarget } from '../lib/externalImport';
import { LAST_IMPORT_LIST_KEY, setLocalPref } from '../lib/localPref';
import { useSync } from '../contexts/SyncContext';
import { useAuth } from '../contexts/AuthContext';
import { useLists } from './useLists';
import { fetchItems, itemsKey } from './useItems';

type QueueRow = Record<string, unknown> & { id: string; updated_at: string };

export interface ApplyImportArgs {
  payload: ImportPayload;
  target: ImportTarget;
  newListType: string;
  newListPrivate: boolean;
  selected: number[];
  merge: boolean;
  knownCategories: string[];
  // Articles déjà présents dans la liste cible, s'ils sont déjà chargés
  // (écran de confirmation) ; sinon lus via le cache/serveur.
  existing?: ItemRow[];
}

export interface ApplyImportResult {
  listId: string;
  // true si la liste cible a été créée par cet import (l'annulation la supprime).
  createdList: boolean;
  count: number;
  undo: () => Promise<void>;
}

// Toutes les écritures passent par la file de sync hors-ligne (SyncContext),
// comme le reste de l'app : un import fonctionne donc sans réseau et part au
// serveur dès que possible.
export function useApplyImport() {
  const queryClient = useQueryClient();
  const { enqueue, discard } = useSync();
  const { session } = useAuth();
  const { createList } = useLists();

  async function loadExisting(listId: string): Promise<ItemRow[]> {
    try {
      return await queryClient.ensureQueryData({ queryKey: itemsKey(listId), queryFn: () => fetchItems(listId) });
    } catch {
      return queryClient.getQueryData<ItemRow[]>(itemsKey(listId)) ?? [];
    }
  }

  function patchItems(listId: string, updater: (items: ItemRow[]) => ItemRow[]) {
    queryClient.setQueryData<ItemRow[]>(itemsKey(listId), (old) => updater(old ?? []));
  }

  async function applyImport(args: ApplyImportArgs): Promise<ApplyImportResult> {
    if (!session) throw new Error('Non connecté');
    const me = session.user.id;

    let createdList: ListRow | null = null;
    let listId: string;
    let existing: ItemRow[];
    if (args.target.kind === 'new') {
      const created = await createList(args.target.name, args.newListType, args.newListPrivate);
      if (!created) throw new Error('Création de la liste impossible');
      createdList = created;
      listId = created.id;
      existing = [];
    } else {
      listId = args.target.listId;
      existing = args.existing ?? (await loadExisting(listId));
    }

    const plan = planImport(args.payload.items, args.selected, existing, args.merge, args.knownCategories);
    const now = new Date().toISOString();
    const added: ItemRow[] = [];
    const merged: { before: ItemRow; after: ItemRow }[] = [];

    for (const entry of plan) {
      if (entry.kind === 'add') {
        added.push({
          id: crypto.randomUUID(),
          list_id: listId,
          name: entry.name,
          qty: entry.qty,
          unit: entry.unit,
          category: entry.category,
          note: entry.note,
          recipe_title: entry.recipeTitle,
          completed: false,
          is_relevant: true,
          added_by: me,
          last_modified_by: me,
          created_at: now,
          updated_at: now,
        });
      } else {
        merged.push({
          before: entry.existing,
          after: {
            ...entry.existing,
            qty: entry.qty,
            category: entry.category,
            note: entry.note,
            recipe_title: entry.recipeTitle,
            last_modified_by: me,
            updated_at: now,
          },
        });
      }
    }

    const mergedIds = new Map(merged.map((m) => [m.after.id, m.after]));
    patchItems(listId, (items) => [...items.map((i) => mergedIds.get(i.id) ?? i), ...added]);
    for (const row of [...merged.map((m) => m.after), ...added]) {
      await enqueue('items', row as unknown as QueueRow);
    }
    setLocalPref(LAST_IMPORT_LIST_KEY, listId);

    async function undoItems() {
      const at = new Date().toISOString();
      const addedIds = new Set(added.map((r) => r.id));
      const beforeById = new Map(merged.map((m) => [m.before.id, m.before]));
      patchItems(listId, (items) => items.filter((i) => !addedIds.has(i.id)).map((i) => beforeById.get(i.id) ?? i));
      // Pas de policy DELETE sur items : retrait "soft" (is_relevant=false),
      // comme "Vider les articles cochés".
      for (const row of added) {
        await enqueue('items', { ...row, is_relevant: false, last_modified_by: me, updated_at: at } as unknown as QueueRow);
      }
      for (const { before } of merged) {
        await enqueue('items', { ...before, last_modified_by: me, updated_at: at } as unknown as QueueRow);
      }
    }

    async function undo() {
      if (!createdList) {
        await undoItems();
        return;
      }
      const list = createdList;
      const removed = await discard([
        { table: 'lists', id: list.id },
        ...added.map((r) => ({ table: 'items' as const, id: r.id })),
      ]);
      const reachedServer = !removed.has(list.id);
      if (reachedServer) {
        const { error } = navigator.onLine
          ? await supabase.from('lists').delete().eq('id', list.id)
          : { error: new Error('hors ligne') };
        if (error) {
          // Liste déjà créée côté serveur mais suppression impossible (hors
          // ligne) : on retire au moins les articles, la liste reste vide.
          await undoItems();
          return;
        }
      }
      queryClient.setQueryData<ListRow[]>(['lists'], (old) => (old ?? []).filter((l) => l.id !== list.id));
      queryClient.removeQueries({ queryKey: itemsKey(list.id) });
    }

    return { listId, createdList: createdList !== null, count: args.selected.length, undo };
  }

  return { applyImport, loadExisting };
}
