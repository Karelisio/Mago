import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../contexts/SyncContext';
import { readSyncErrors, clearSyncErrors, type SyncErrorEntry } from '../lib/syncErrorLog';

export function SyncDiagnostics() {
  const { session } = useAuth();
  const { pendingCount, flush, resetQueue } = useSync();
  const [errors, setErrors] = useState<SyncErrorEntry[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setErrors(await readSyncErrors());
  }

  useEffect(() => {
    void refresh();
  }, []);

  const expiresAt = session?.expires_at ? new Date(session.expires_at * 1000) : null;
  const expired = expiresAt ? expiresAt.getTime() < Date.now() : null;

  async function handleForceSync() {
    setBusy(true);
    await flush();
    await refresh();
    setBusy(false);
  }

  async function handleClearErrors() {
    await clearSyncErrors();
    setErrors([]);
  }

  async function handleResetQueue() {
    if (!window.confirm('Vider la queue de sync locale ? Les créations/modifications non synchronisées seront perdues.')) return;
    await resetQueue();
  }

  function handleCopy() {
    const text = errors.map((e) => `${e.at} [${e.table}/${e.rowId}] ${e.message}`).join('\n');
    void navigator.clipboard?.writeText(text || 'Aucune erreur enregistrée.');
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
      <p style={{ margin: 0 }}>
        Session : {session ? 'active' : 'aucune'}
        {expiresAt && (
          <>
            {' '}— expire à {expiresAt.toLocaleTimeString()} ({expired ? 'expirée' : 'valide'})
          </>
        )}
      </p>
      <p style={{ margin: 0 }}>En attente de sync : {pendingCount}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn-text" onClick={handleForceSync} disabled={busy}>
          {busy ? 'Sync…' : 'Forcer la sync'}
        </button>
        <button className="btn-text" onClick={() => void refresh()}>
          Rafraîchir le journal
        </button>
        <button className="btn-text" onClick={handleCopy}>
          Copier le journal
        </button>
        <button className="btn-text" onClick={handleClearErrors}>
          Vider le journal
        </button>
        <button className="btn-text" onClick={handleResetQueue} style={{ color: 'var(--md-error)' }}>
          Vider la queue locale
        </button>
      </div>

      {errors.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--md-on-surface-variant)' }}>Aucune erreur de sync enregistrée.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {errors.map((e, i) => (
            <div key={i} style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-word' }}>
              <div style={{ color: 'var(--md-on-surface-variant)' }}>
                {new Date(e.at).toLocaleTimeString()} · {e.table}/{e.rowId.slice(0, 8)}
              </div>
              <div>{e.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
