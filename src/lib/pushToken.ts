import { registerPlugin } from '@capacitor/core';

interface PushTokenPlugin {
  getFcmToken(): Promise<{ token: string }>;
  getPendingToken(): Promise<{ token: string | null }>;
  clearPendingToken(): Promise<void>;
}

export const PushToken = registerPlugin<PushTokenPlugin>('PushToken');
