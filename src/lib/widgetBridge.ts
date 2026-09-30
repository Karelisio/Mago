import { registerPlugin } from '@capacitor/core';
import type { ItemRow } from './database.types';

// Article tel qu'affiché par le widget : seulement les colonnes utiles, avec
// les noms de colonnes Postgres (snake_case). Même forme que le snapshot
// poussé par l'Edge Function notify-item-change (chemin FCM, app fermée),
// allégé pour tenir dans la limite de 4 Ko d'un push FCM. Cocher un article
// depuis le widget met en file un patch dans la queue de sync hors-ligne
// (voir offlineQueue.ts et MagoWidgetProvider.kt), jamais cette ligne.
export type WidgetItem = Pick<ItemRow, 'id' | 'list_id' | 'name' | 'qty' | 'unit' | 'completed'>;

interface WidgetSnapshot {
  list_id: string;
  list_name: string;
  user_id: string;
  // Nombre d'articles de la liste (cochés compris).
  total: number;
  // Nombre d'articles non cochés (tous, pas seulement ceux affichés).
  remaining: number;
  // Articles non cochés, dans l'ordre de l'app, WIDGET_MAX_ITEMS au plus.
  items: WidgetItem[];
}

interface WidgetBridgePlugin {
  updateSnapshot(snapshot: WidgetSnapshot): Promise<void>;
  // Déconnexion : efface l'aperçu (le widget repasse sur son écran d'attente)
  // et fait ignorer les push FCM jusqu'au prochain updateSnapshot().
  clearSnapshot(): Promise<void>;
}

export const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');
