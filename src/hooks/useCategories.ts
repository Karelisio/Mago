import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { CategoryRow } from '../lib/database.types';
import { useAuth } from '../contexts/AuthContext';

// Catégories de listes et d'articles gérées à la volée par les
// utilisateurs (partagées entre le couple), à la place des ensembles fixes
// codés en dur d'avant. Même table/policies pour les deux, seul le nom de
// la table change.
function useCategories(table: 'list_categories' | 'item_categories') {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const queryKey = [table] as const;

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select('*').order('name', { ascending: true });
      if (error) throw error;
      return data as CategoryRow[];
    },
    enabled: !!session,
  });

  async function addCategory(name: string) {
    if (!session || !name.trim()) return { error: null };
    const { error } = await supabase.from(table).insert({ name: name.trim(), created_by: session.user.id });
    if (!error) await queryClient.invalidateQueries({ queryKey });
    return { error: error?.message ?? null };
  }

  async function deleteCategory(id: string) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (!error) await queryClient.invalidateQueries({ queryKey });
    return { error: error?.message ?? null };
  }

  return { ...query, addCategory, deleteCategory };
}

export function useListCategories() {
  return useCategories('list_categories');
}

export function useItemCategories() {
  return useCategories('item_categories');
}
