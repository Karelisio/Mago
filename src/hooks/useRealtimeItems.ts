import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// supabase.channel(topic) réutilise le même RealtimeChannel si un canal
// avec ce topic existe déjà (voir RealtimeClient.channel() dans
// @supabase/realtime-js) au lieu d'en créer un nouveau. Ce hook est monté
// deux fois avec potentiellement le même listId (useWidgetSync.ts pour la
// liste fixe du widget, ListDetail.tsx pour la liste consultée) : sans ce
// compteur de références, le second à monter récupère le canal déjà
// subscribe() par le premier et son .on(...) lève "cannot add
// postgres_changes callbacks ... after subscribe()", qui démonte toute
// l'app faute d'ErrorBoundary jusqu'ici. Les deux appelants invalidant la
// même clé React Query (['items', listId]), un seul abonnement réel par
// listId suffit.
const subscriptions = new Map<string, { channel: RealtimeChannel; refCount: number }>();

export function useRealtimeItems(listId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!listId) return;

    let entry = subscriptions.get(listId);
    if (!entry) {
      const channel = subscribeToItems(listId, queryClient);
      entry = { channel, refCount: 0 };
      subscriptions.set(listId, entry);
    }
    entry.refCount += 1;

    return () => {
      const current = subscriptions.get(listId);
      if (!current) return;
      current.refCount -= 1;
      if (current.refCount <= 0) {
        subscriptions.delete(listId);
        void supabase.removeChannel(current.channel);
      }
    };
  }, [listId, queryClient]);
}

function subscribeToItems(listId: string, queryClient: QueryClient) {
  return supabase
    .channel(`items:${listId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'items', filter: `list_id=eq.${listId}` },
      () => {
        void queryClient.invalidateQueries({ queryKey: ['items', listId] });
      },
    )
    .subscribe();
}
