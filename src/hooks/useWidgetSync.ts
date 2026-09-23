import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { useLists } from './useLists';
import { useItems } from './useItems';
import { useRealtimeItems } from './useRealtimeItems';
import { useWidgetListId } from './useWidgetListPref';
import { WidgetBridge } from '../lib/widgetBridge';

// Alimente le widget directement depuis l'app (ouverture, changement local,
// temps réel via Supabase Realtime), en plus du chemin FCM (MagoFcmService)
// qui couvre le cas app fermée. Sans ça, un widget tout juste ajouté reste
// bloqué sur son état "Ouvre l'app pour charger ta liste" tant qu'aucun push
// n'est encore arrivé. Une seule liste fixe pour la v1 (la plus ancienne,
// même tri que useLists.ts).
//
// Les items envoyés gardent les noms de colonnes Postgres (snake_case) :
// si un article est coché depuis le widget app fermée, le natif l'ajoute
// tel quel à la queue de sync hors-ligne existante (voir offlineQueue.ts),
// synchronisée normalement par SyncContext à la prochaine ouverture — pas
// besoin d'un jeton d'accès natif pour écrire depuis le widget.
export function useWidgetSync() {
  const { session } = useAuth();
  const { data: lists } = useLists();
  const widgetListId = useWidgetListId();
  // Liste choisie par l'utilisateur (Réglages) si elle existe encore,
  // sinon repli sur la plus ancienne (comportement par défaut, voir
  // CLAUDE.md).
  const chosenList = widgetListId ? lists?.find((l) => l.id === widgetListId) : undefined;
  const firstList = chosenList ?? lists?.[0];
  const listId = firstList?.id ?? '';

  const { data: items } = useItems(listId);
  useRealtimeItems(listId);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !session || !firstList || !items) return;

    const remaining = items.filter((item) => !item.completed);
    void WidgetBridge.updateSnapshot({
      list_id: firstList.id,
      list_name: firstList.name,
      user_id: session.user.id,
      total: items.length,
      items: remaining.slice(0, 5),
    }).catch(() => {
      // Best-effort : le widget reste sur son dernier snapshot connu.
    });
  }, [session, firstList, items]);
}
