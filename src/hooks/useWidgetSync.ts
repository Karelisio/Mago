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
// n'est encore arrivé. Une seule liste : celle choisie dans Réglages, sinon
// la plus ancienne (même tri que useLists.ts) — MagoFcmService ignore les
// push des autres listes d'après le list_id envoyé ici.
//
// Même format que le snapshot de notify-item-change/index.ts (chemin FCM,
// app fermée) : articles non cochés réduits à quelques colonnes (noms
// Postgres, snake_case, voir WidgetItem), remaining = nombre total
// d'articles non cochés. Si un article est coché depuis le widget, le natif
// met en file un patch dans la queue de sync hors-ligne existante (voir
// offlineQueue.ts), synchronisée normalement par SyncContext — pas besoin
// d'un jeton d'accès natif pour écrire depuis le widget.
//
// WIDGET_MAX_ITEMS doit rester identique à notify-item-change/index.ts
// (chemin FCM, app fermée) et au nombre de lignes de
// res/layout/widget_list_glance.xml / MagoWidgetProvider.kt (rowIds).
const WIDGET_MAX_ITEMS = 20;

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

    const unchecked = items.filter((item) => !item.completed);
    void WidgetBridge.updateSnapshot({
      list_id: firstList.id,
      list_name: firstList.name,
      user_id: session.user.id,
      total: items.length,
      remaining: unchecked.length,
      items: unchecked
        .slice(0, WIDGET_MAX_ITEMS)
        .map(({ id, list_id, name, qty, unit, completed }) => ({ id, list_id, name, qty, unit, completed })),
    }).catch(() => {
      // Best-effort : le widget reste sur son dernier snapshot connu.
    });
  }, [session, firstList, items]);
}
