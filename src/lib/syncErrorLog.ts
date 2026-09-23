import { Preferences } from '@capacitor/preferences';

const LOG_KEY = 'mago_sync_error_log_v1';
const MAX_ENTRIES = 20;

export interface SyncErrorEntry {
  at: string;
  table: string;
  rowId: string;
  message: string;
  rowOwnerId?: string;
  sessionUserId?: string;
}

export async function readSyncErrors(): Promise<SyncErrorEntry[]> {
  const { value } = await Preferences.get({ key: LOG_KEY });
  if (!value) return [];
  try {
    return JSON.parse(value) as SyncErrorEntry[];
  } catch {
    return [];
  }
}

export async function logSyncError(
  table: string,
  rowId: string,
  message: string,
  rowOwnerId?: string,
  sessionUserId?: string,
): Promise<void> {
  const current = await readSyncErrors();
  const next = [
    { at: new Date().toISOString(), table, rowId, message, rowOwnerId, sessionUserId },
    ...current,
  ].slice(0, MAX_ENTRIES);
  await Preferences.set({ key: LOG_KEY, value: JSON.stringify(next) });
}

export async function clearSyncErrors(): Promise<void> {
  await Preferences.remove({ key: LOG_KEY });
}
