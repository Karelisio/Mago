import { useSync } from '../contexts/SyncContext';

const LABELS = {
  synced: 'Synchronisé',
  pending: 'En attente…',
  offline: 'Hors ligne',
};

export function SyncIndicator() {
  const { status, pendingCount } = useSync();
  return (
    <span className={`sync-indicator ${status}`}>
      {LABELS[status]}
      {status === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
    </span>
  );
}
