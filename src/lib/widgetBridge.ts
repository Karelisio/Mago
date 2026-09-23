import { registerPlugin } from '@capacitor/core';

interface WidgetSnapshot {
  listName: string;
  remaining: number;
  total: number;
  items: string[];
}

interface WidgetBridgePlugin {
  updateSnapshot(snapshot: WidgetSnapshot): Promise<void>;
}

export const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');
