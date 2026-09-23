import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useLists } from './useLists';
import { useItems } from './useItems';
import { useRealtimeItems } from './useRealtimeItems';
import { WidgetBridge } from '../lib/widgetBridge';

// Alimente le widget directement depuis l'app (ouverture, changement local,
// temps réel via Supabase Realtime), en plus du chemin FCM (MagoFcmService)
// qui couvre le cas app fermée. Sans ça, un widget tout juste ajouté reste
// bloqué sur son état "Ouvre l'app pour charger ta liste" tant qu'aucun push
// n'est encore arrivé. Une seule liste fixe pour la v1 (la plus ancienne,
// même tri que useLists.ts).
export function useWidgetSync() {
  const { data: lists } = useLists();
  const firstList = lists?.[0];
  const listId = firstList?.id ?? '';

  const { data: items } = useItems(listId);
  useRealtimeItems(listId);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !firstList || !items) return;

    const remaining = items.filter((item) => !item.completed);
    void WidgetBridge.updateSnapshot({
      listName: firstList.name,
      remaining: remaining.length,
      total: items.length,
      items: remaining.slice(0, 5).map((item) => item.name),
    }).catch(() => {
      // Best-effort : le widget reste sur son dernier snapshot connu.
    });
  }, [firstList, items]);
}
