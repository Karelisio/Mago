import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { ItemRow } from '../lib/database.types';
import { useSync } from '../contexts/SyncContext';
import { useAuth } from '../contexts/AuthContext';

function itemsKey(listId: string) {
  return ['items', listId] as const;
}

export function useItems(listId: string) {
  const queryClient = useQueryClient();
  const { enqueue } = useSync();
  const { session } = useAuth();

  const query = useQuery({
    queryKey: itemsKey(listId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('list_id', listId)
        .eq('is_relevant', true)
        .order('category', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return data as ItemRow[];
    },
    enabled: !!session && !!listId,
  });

  function patchCache(updater: (items: ItemRow[]) => ItemRow[]) {
    queryClient.setQueryData<ItemRow[]>(itemsKey(listId), (old) => updater(old ?? []));
  }

  async function addItem(input: Pick<ItemRow, 'name' | 'qty' | 'unit' | 'category'>) {
    if (!session) return;
    const now = new Date().toISOString();
    const item: ItemRow = {
      id: crypto.randomUUID(),
      list_id: listId,
      name: input.name,
      qty: input.qty,
      unit: input.unit,
      category: input.category,
      completed: false,
      is_relevant: true,
      added_by: session.user.id,
      created_at: now,
      updated_at: now,
    };
    patchCache((items) => [...items, item]);
    await enqueue('items', item as unknown as Record<string, unknown> & { id: string; updated_at: string });
  }

  async function toggleCompleted(item: ItemRow) {
    const updated: ItemRow = { ...item, completed: !item.completed, updated_at: new Date().toISOString() };
    patchCache((items) => items.map((i) => (i.id === item.id ? updated : i)));
    await enqueue('items', updated as unknown as Record<string, unknown> & { id: string; updated_at: string });
  }

  async function editItem(item: ItemRow, changes: Partial<Pick<ItemRow, 'name' | 'qty' | 'unit' | 'category'>>) {
    const updated: ItemRow = { ...item, ...changes, updated_at: new Date().toISOString() };
    patchCache((items) => items.map((i) => (i.id === item.id ? updated : i)));
    await enqueue('items', updated as unknown as Record<string, unknown> & { id: string; updated_at: string });
  }

  async function clearCheckedItems(items: ItemRow[]) {
    const checked = items.filter((i) => i.completed);
    if (checked.length === 0) return;
    const now = new Date().toISOString();
    const checkedIds = new Set(checked.map((i) => i.id));
    patchCache((current) => current.filter((i) => !checkedIds.has(i.id)));
    for (const item of checked) {
      const updated: ItemRow = { ...item, is_relevant: false, updated_at: now };
      await enqueue('items', updated as unknown as Record<string, unknown> & { id: string; updated_at: string });
    }
  }

  return { ...query, addItem, toggleCompleted, editItem, clearCheckedItems };
}
