import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLists } from '../hooks/useLists';
import { useListCategories } from '../hooks/useCategories';
import { useAuth } from '../contexts/AuthContext';
import { useImport } from '../contexts/ImportContext';
import type { ListRow } from '../lib/database.types';
import { categoryTone } from '../lib/categoryTone';
import { getLocalPref, setLocalPref, LAST_LIST_TYPE_KEY } from '../lib/localPref';
import { SyncIndicator } from '../components/SyncIndicator';
import { MagoIcon } from '../components/MagoIcon';
import { ConfirmDialog } from '../components/ConfirmDialog';

export function Lists() {
  const { data: lists, isLoading, createList, deleteList, swapPositions, refetch, isRefetching } = useLists();
  const { data: categories } = useListCategories();
  const { session } = useAuth();
  const { showSnackbar } = useImport();
  const [filter, setFilter] = useState<string>('all');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState(() => getLocalPref(LAST_LIST_TYPE_KEY));
  const [shared, setShared] = useState(true);
  const [toDelete, setToDelete] = useState<ListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const categoryNames = (categories ?? []).map((c) => c.name);
  // Le type reste optionnel : la table des types de liste peut être vidée
  // (Réglages), la liste est alors créée sans type ('') plutôt que de
  // bloquer la création — voir CLAUDE.md. Un type mémorisé qui n'existe plus
  // n'est pas réutilisé une fois les types chargés.
  const effectiveNewType =
    categories && !categoryNames.includes(newType) ? (categoryNames[0] ?? '') : newType;

  // Le type choisi pour créer une liste reste sélectionné (persisté) jusqu'à
  // changement volontaire, plutôt que de retomber sur le premier de la liste
  // à chaque fois.
  useEffect(() => {
    if (categoryNames.length === 0) return;
    if (!newType || !categoryNames.includes(newType)) setNewType(categoryNames[0]);
  }, [newType, categoryNames]);

  function handleTypeChange(value: string) {
    setNewType(value);
    setLocalPref(LAST_LIST_TYPE_KEY, value);
  }

  const filtered = (lists ?? []).filter((l) => filter === 'all' || l.type === filter);

  // Rangées par catégorie (ordre alphabétique des catégories, les listes sans
  // type en dernier), triées par position (modifiable via les boutons
  // monter/descendre) dans chaque catégorie — l'ordre de récupération
  // (created_at) reste inchangé pour le widget, ce regroupement n'affecte
  // que l'affichage.
  const groups = new Map<string, typeof filtered>();
  for (const list of filtered) {
    groups.set(list.type, [...(groups.get(list.type) ?? []), list]);
  }
  const sortedGroups = [...groups.entries()]
    .map(([type, items]) => [type, [...items].sort((a, b) => a.position - b.position)] as const)
    .sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])));

  async function handleCreate() {
    if (!newName.trim()) return;
    await createList(newName.trim(), effectiveNewType, !shared);
    setNewName('');
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const { error } = await deleteList(toDelete);
    setDeleting(false);
    setToDelete(null);
    if (error) showSnackbar(error);
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
        {categoryNames.length > 0 && (
          <select value={effectiveNewType} onChange={(e) => handleTypeChange(e.target.value)}>
            {categoryNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        <button className="btn-primary" onClick={handleCreate} disabled={!newName.trim()}>
          Créer
        </button>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: -12,
          marginBottom: 20,
          fontSize: 13,
          color: 'var(--md-on-surface-variant)',
        }}
      >
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
        Partager avec mon/ma partenaire
      </label>

      {isLoading && <p>Chargement…</p>}

      {sortedGroups.map(([type, groupLists]) => (
        <div key={type}>
          <h3 style={{ margin: '12px 0 8px' }}>{type || 'Sans type'}</h3>
          {groupLists.map((list, index) => (
            <div className="list-card" key={list.id}>
              <span className={`list-dot tone-${categoryTone(list.type)}`} />
              <Link to={`/lists/${list.id}`} style={{ color: 'inherit', textDecoration: 'none', flex: 1 }}>
                <strong>{list.name}</strong>
                {list.is_private && (
                  <span style={{ fontSize: 12, color: 'var(--md-on-surface-variant)', marginLeft: 6 }}>🔒 privée</span>
                )}
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
              {/* Seul·e le/la propriétaire peut supprimer (policy lists_delete). */}
              {list.owner_id === session?.user.id && (
                <button className="btn-text" onClick={() => setToDelete(list)} aria-label={`Supprimer ${list.name}`}>
                  Supprimer
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      {!isLoading && filtered.length === 0 && <p>Aucune liste pour l'instant.</p>}

      {toDelete && (
        <ConfirmDialog
          title={`Supprimer « ${toDelete.name} » ?`}
          message={
            toDelete.is_private
              ? 'La liste et tous ses articles seront supprimés définitivement.'
              : 'La liste et tous ses articles seront supprimés définitivement, y compris pour les personnes avec qui elle est partagée.'
          }
          confirmLabel={deleting ? 'Suppression…' : 'Supprimer'}
          destructive
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
