import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useItems } from '../hooks/useItems';
import { useRealtimeItems } from '../hooks/useRealtimeItems';
import { useItemCategories } from '../hooks/useCategories';
import { getLocalPref, setLocalPref } from '../lib/localPref';
import { SyncIndicator } from '../components/SyncIndicator';

const LAST_CATEGORY_KEY = 'mago:lastItemCategory';

export function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const listId = id ?? '';
  const { data: items, isLoading, addItem, toggleCompleted, clearCheckedItems, refetch, isRefetching } = useItems(listId);
  useRealtimeItems(listId);
  const { data: categories } = useItemCategories();

  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState(() => getLocalPref(LAST_CATEGORY_KEY));

  const categoryNames = (categories ?? []).map((c) => c.name);

  // La catégorie choisie reste sélectionnée (persistée) jusqu'à changement
  // volontaire ; on ne retombe sur la première catégorie disponible que si
  // rien n'est encore choisi ou que le choix persisté n'existe plus.
  useEffect(() => {
    if (categoryNames.length === 0) return;
    if (!category || !categoryNames.includes(category)) setCategory(categoryNames[0]);
  }, [category, categoryNames]);

  function handleCategoryChange(value: string) {
    setCategory(value);
    setLocalPref(LAST_CATEGORY_KEY, value);
  }

  const hasChecked = (items ?? []).some((i) => i.completed);

  async function handleAdd() {
    // La catégorie n'est plus obligatoire : la table item_categories peut
    // être vidée par l'utilisateur (Réglages) sans que ça bloque l'ajout
    // d'articles — voir CLAUDE.md.
    if (!name.trim()) return;
    await addItem({
      name: name.trim(),
      qty: qty ? Number(qty) : null,
      unit: unit.trim() || null,
      category: category || null,
    });
    setName('');
    setQty('');
    setUnit('');
  }

  // Rangés par catégorie (ordre alphabétique), le tri par catégorie puis
  // nom vient déjà de la requête (useItems.ts).
  const groups = new Map<string, NonNullable<typeof items>>();
  for (const item of items ?? []) {
    const key = item.category || '(sans catégorie)';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div>
      <div className="top-bar">
        <Link to="/lists" className="btn-text">
          ← Listes
        </Link>
        <SyncIndicator />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder="Article" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 2 }} />
        <input placeholder="Qté" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 60 }} />
        <input placeholder="Unité" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 80 }} />
        <select value={category} onChange={(e) => handleCategoryChange(e.target.value)}>
          {categoryNames.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="btn-primary" onClick={handleAdd} disabled={!name.trim()}>
          Ajouter
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <button className="btn-text" onClick={() => refetch()} disabled={isRefetching}>
          {isRefetching ? 'Rafraîchissement…' : '↻ Rafraîchir'}
        </button>
        <button className="btn-text" onClick={() => clearCheckedItems(items ?? [])} disabled={!hasChecked}>
          Vider les articles cochés
        </button>
      </div>

      {isLoading && <p>Chargement…</p>}

      {sortedGroups.map(([groupName, groupItems]) => (
        <div key={groupName}>
          <h3 style={{ margin: '12px 0 4px', fontSize: 14, color: 'var(--md-on-surface-variant)' }}>{groupName}</h3>
          {groupItems.map((item) => (
            <div key={item.id} className={`item-row ${item.completed ? 'completed' : ''}`}>
              <input type="checkbox" checked={item.completed} onChange={() => toggleCompleted(item)} />
              <div style={{ flex: 1 }}>
                <div className="item-name">{item.name}</div>
                <div style={{ fontSize: 12, color: 'var(--md-on-surface-variant)' }}>
                  {[item.qty, item.unit].filter(Boolean).join(' ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {!isLoading && (items ?? []).length === 0 && <p>Cette liste est vide.</p>}
    </div>
  );
}
