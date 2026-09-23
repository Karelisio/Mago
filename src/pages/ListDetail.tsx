import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useItems } from '../hooks/useItems';
import { useRealtimeItems } from '../hooks/useRealtimeItems';
import { SyncIndicator } from '../components/SyncIndicator';

const CATEGORIES = ['Produits frais', 'Laiterie', 'Viande', 'Pantry', 'Autres'];

export function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const listId = id ?? '';
  const { data: items, isLoading, addItem, toggleCompleted, clearCheckedItems, refetch, isRefetching } = useItems(listId);
  useRealtimeItems(listId);

  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);

  const hasChecked = (items ?? []).some((i) => i.completed);

  async function handleAdd() {
    if (!name.trim()) return;
    await addItem({
      name: name.trim(),
      qty: qty ? Number(qty) : null,
      unit: unit.trim() || null,
      category,
    });
    setName('');
    setQty('');
    setUnit('');
  }

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
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="btn-primary" onClick={handleAdd}>
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

      {items?.map((item) => (
        <div key={item.id} className={`item-row ${item.completed ? 'completed' : ''}`}>
          <input type="checkbox" checked={item.completed} onChange={() => toggleCompleted(item)} />
          <div style={{ flex: 1 }}>
            <div className="item-name">{item.name}</div>
            <div style={{ fontSize: 12, color: 'var(--md-on-surface-variant)' }}>
              {[item.qty, item.unit].filter(Boolean).join(' ')} {item.category ? `· ${item.category}` : ''}
            </div>
          </div>
        </div>
      ))}

      {!isLoading && (items ?? []).length === 0 && <p>Cette liste est vide.</p>}
    </div>
  );
}
