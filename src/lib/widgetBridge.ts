import { registerPlugin } from '@capacitor/core';
import type { ItemRow } from './database.types';

// Les objets de "items" utilisent exactement les noms de colonnes Postgres
// (snake_case) : côté natif, un item coché depuis le widget est mis en
// attente dans la même queue de sync hors-ligne que le reste de l'app
// (voir offlineQueue.ts), qui envoie ces lignes telles quelles à Supabase.
interface WidgetSnapshot {
  list_id: string;
  list_name: string;
  user_id: string;
  total: number;
  items: ItemRow[];
}

interface WidgetBridgePlugin {
  updateSnapshot(snapshot: WidgetSnapshot): Promise<void>;
}

export const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');
