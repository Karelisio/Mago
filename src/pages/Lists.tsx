import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLists } from '../hooks/useLists';
import { useListCategories } from '../hooks/useCategories';
import { categoryTone } from '../lib/categoryTone';
import { getLocalPref, setLocalPref } from '../lib/localPref';
import { SyncIndicator } from '../components/SyncIndicator';
import { MagoIcon } from '../components/MagoIcon';

const LAST_TYPE_KEY = 'mago:lastListType';

export function Lists() {
  const { data: lists, isLoading, createList, deleteList, swapPositions, refetch, isRefetching } = useLists();
  const { data: categories } = useListCategories();
  const [filter, setFilter] = useState<string>('all');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState(() => getLocalPref(LAST_TYPE_KEY));

  const categoryNames = (categories ?? []).map((c) => c.name);
  const effectiveNewType = newType || categoryNames[0] || '';

  // Le type choisi pour créer une liste reste sélectionné (persisté) jusqu'à
  // changement volontaire, plutôt que de retomber sur le premier de la liste
  // à chaque fois.
  useEffect(() => {
    if (categoryNames.length === 0) return;
    if (!newType || !categoryNames.includes(newType)) setNewType(categoryNames[0]);
  }, [newType, categoryNames]);

  function handleTypeChange(value: string) {
    setNewType(value);
    setLocalPref(LAST_TYPE_KEY, value);
  }

  const filtered = (lists ?? []).filter((l) => filter === 'all' || l.type === filter);

  // Rangées par catégorie (ordre alphabétique des catégories), triées par
  // position (modifiable via les boutons monter/descendre) dans chaque
  // catégorie — l'ordre de récupération (created_at) reste inchangé pour le
  // widget, ce regroupement n'affecte que l'affichage.
  const groups = new Map<string, typeof filtered>();
  for (const list of filtered) {
    const key = list.type || '(sans catégorie)';
    groups.set(key, [...(groups.get(key) ?? []), list]);
  }
  const sortedGroups = [...groups.entries()]
    .map(([type, items]) => [type, [...items].sort((a, b) => a.position - b.position)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));

  async function handleCreate() {
    if (!newName.trim() || !effectiveNewType) return;
    await createList(newName.trim(), effectiveNewType);
    setNewName('');
  }

  return (
    <div>
      <div className="top-bar">
        <div className="top-bar-title">
          <MagoIcon size={28} />
          <div>
            <h1>Mago</h1>
            <p className="top-bar-subtitle">Mes listes</p>
          </div>
        </div>
        <SyncIndicator />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Toutes</option>
          {categoryNames.map((name) => (
            <option key={name} value={name}>
              {name}
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
        <select value={effectiveNewType} onChange={(e) => handleTypeChange(e.target.value)}>
          {categoryNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button className="btn-primary" onClick={handleCreate} disabled={!effectiveNewType}>
          Créer
        </button>
      </div>

      {isLoading && <p>Chargement…</p>}

      {sortedGroups.map(([type, groupLists]) => (
        <div key={type}>
          <h3 style={{ margin: '12px 0 8px' }}>{type}</h3>
          {groupLists.map((list, index) => (
            <div className="list-card" key={list.id}>
              <span className={`list-dot tone-${categoryTone(list.type)}`} />
              <Link to={`/lists/${list.id}`} style={{ color: 'inherit', textDecoration: 'none', flex: 1 }}>
                <strong>{list.name}</strong>
              </Link>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button
                  className="btn-text"
                  style={{ padding: '0 4px', lineHeight: 1 }}
                  disabled={index === 0}
                  onClick={() => swapPositions(list, groupLists[index - 1])}
                  aria-label={`Monter ${list.name}`}
                >
                  ↑
                </button>
                <button
                  className="btn-text"
                  style={{ padding: '0 4px', lineHeight: 1 }}
                  disabled={index === groupLists.length - 1}
                  onClick={() => swapPositions(list, groupLists[index + 1])}
                  aria-label={`Descendre ${list.name}`}
                >
                  ↓
                </button>
              </div>
              <button className="btn-text" onClick={() => deleteList(list)} aria-label="Supprimer la liste">
                Supprimer
              </button>
            </div>
          ))}
        </div>
      ))}

      {!isLoading && filtered.length === 0 && <p>Aucune liste pour l'instant.</p>}
    </div>
  );
}
