import { useCallback, useEffect, useState } from 'react';
import type { VitrineData } from '../types';

export type DataState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: VitrineData };

function isVitrineData(value: unknown): value is VitrineData {
  const v = value as Partial<VitrineData> | null;
  return !!v && typeof v === 'object' && Array.isArray(v.repos) && !!v.profile && typeof v.profile.login === 'string';
}

/** Charge public/data.json (revalidé à chaque visite : il change toutes les 6 h). */
export function useData(): DataState & { retry: () => void } {
  const [state, setState] = useState<DataState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(`${import.meta.env.BASE_URL}data.json`, { cache: 'no-cache', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`data.json introuvable (HTTP ${res.status})`);
        const json: unknown = await res.json();
        if (!isVitrineData(json)) throw new Error('data.json a un format inattendu');
        setState({ status: 'ready', data: json });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
