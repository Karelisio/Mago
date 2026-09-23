import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLists } from '../hooks/useLists';
import type { ListType } from '../lib/database.types';
import { SyncIndicator } from '../components/SyncIndicator';

const TYPE_LABELS: Record<ListType, string> = {
  courses: 'Courses',
  diy: 'DIY',
  cadeaux: 'Cadeaux',
  autre: 'Autre',
};

export function Lists() {
  const { data: lists, isLoading, createList, deleteList, refetch, isRefetching } = useLists();
  const [filter, setFilter] = useState<ListType | 'all'>('all');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ListType>('courses');

  const filtered = (lists ?? []).filter((l) => filter === 'all' || l.type === filter);

  async function handleCreate() {
    if (!newName.trim()) return;
    await createList(newName.trim(), newType);
    setNewName('');
  }

  return (
    <div>
      <div className="top-bar">
        <h2>Mes listes</h2>
        <SyncIndicator />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value as ListType | 'all')}>
          <option value="all">Toutes</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="btn-text" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching ? 'Rafraîchissement…' : '↻ Rafraîchir'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          placeholder="Nouvelle liste"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ flex: 1, minWidth: 120 }}
        />
        <select value={newType} onChange={(e) => setNewType(e.target.value as ListType)}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="btn-primary" onClick={handleCreate}>
          Créer
        </button>
      </div>

      {isLoading && <p>Chargement…</p>}

      {filtered.map((list) => (
        <div className="card" key={list.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to={`/lists/${list.id}`} style={{ color: 'inherit', textDecoration: 'none', flex: 1 }}>
            <strong>{list.name}</strong>
            <div style={{ fontSize: 12, color: 'var(--md-on-surface-variant)' }}>{TYPE_LABELS[list.type]}</div>
          </Link>
          <button className="btn-text" onClick={() => deleteList(list)} aria-label="Supprimer la liste">
            Supprimer
          </button>
        </div>
      ))}

      {!isLoading && filtered.length === 0 && <p>Aucune liste pour l'instant.</p>}
    </div>
  );
}
