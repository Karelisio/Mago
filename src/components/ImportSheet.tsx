import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ListRow } from '../lib/database.types';
import {
  formatQuantity,
  pickDefaultTarget,
  planImport,
  type ImportPayload,
  type ImportTarget,
  type PlannedEntry,
} from '../lib/externalImport';
import {
  getLocalPref,
  IMPORT_AUTO_CONFIRM_KEY,
  LAST_IMPORT_LIST_KEY,
  LAST_LIST_TYPE_KEY,
} from '../lib/localPref';
import { useImport } from '../contexts/ImportContext';
import { useLists } from '../hooks/useLists';
import { useItems } from '../hooks/useItems';
import { useItemCategories, useListCategories } from '../hooks/useCategories';
import { useApplyImport, type ApplyImportArgs } from '../hooks/useApplyImport';

const NEW_LIST = '__new__';
const LISTS_WAIT_MS = 8000;

function articles(n: number) {
  return `${n} article${n > 1 ? 's' : ''}`;
}

function defaultListType(listTypes: string[]) {
  const last = getLocalPref(LAST_LIST_TYPE_KEY);
  return listTypes.includes(last) ? last : (listTypes[0] ?? '');
}

// Monté par App.tsx uniquement quand une session existe : un import reçu
// avant connexion reste en attente et s'affiche juste après.
export function ImportHost() {
  const { pending, pendingId, clearPending, showSnackbar } = useImport();
  const lists = useLists();
  const listCategories = useListCategories();
  const itemCategories = useItemCategories();
  const { applyImport } = useApplyImport();
  const navigate = useNavigate();
  const autoRunning = useRef(false);

  // On n'attend jamais indéfiniment les listes : hors ligne sans cache la
  // requête reste en pause, et un serveur injoignable peut la faire
  // traîner. Passé ce délai, l'import peut toujours viser une nouvelle liste
  // (créée via la file de sync).
  const [waitExpired, setWaitExpired] = useState(false);
  useEffect(() => {
    setWaitExpired(false);
    if (!pending) return;
    const timer = setTimeout(() => setWaitExpired(true), LISTS_WAIT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);
  const listsReady = lists.isSuccess || lists.isError || lists.fetchStatus === 'paused' || waitExpired;
  // Sans confirmation, on ne choisit la liste cible à l'aveugle que si les
  // listes sont réellement connues ; sinon (non chargées) on retombe sur
  // l'écran de confirmation plutôt que de créer un doublon de liste.
  const autoConfirm =
    getLocalPref(IMPORT_AUTO_CONFIRM_KEY) === '1' && lists.data !== undefined && listCategories.data !== undefined;
  const listRows = lists.data ?? [];
  const listTypes = (listCategories.data ?? []).map((c) => c.name);
  const knownCategories = (itemCategories.data ?? []).map((c) => c.name);

  async function run(args: ApplyImportArgs) {
    const source = args.payload.source;
    clearPending();
    try {
      const result = await applyImport(args);
      navigate(`/lists/${result.listId}`);
      showSnackbar(`${articles(result.count)} ajouté${result.count > 1 ? 's' : ''} depuis ${source}`, {
        label: 'Annuler',
        onPress: () => {
          void result
            .undo()
            .then(() => {
              if (result.createdList) navigate('/lists');
              showSnackbar('Import annulé');
            })
            .catch(() => showSnackbar('Annulation impossible'));
        },
      });
    } catch (err) {
      showSnackbar(`Import impossible : ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  useEffect(() => {
    if (!pending || !autoConfirm || !listsReady || autoRunning.current) return;
    autoRunning.current = true;
    void run({
      payload: pending,
      target: pickDefaultTarget(listRows, pending.listName, getLocalPref(LAST_IMPORT_LIST_KEY), `Import ${pending.source}`),
      newListType: defaultListType(listTypes),
      newListPrivate: false,
      selected: pending.items.map((_, i) => i),
      merge: true,
      knownCategories,
    }).finally(() => {
      autoRunning.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, autoConfirm, listsReady]);

  if (!pending || autoConfirm) return null;

  if (!listsReady) {
    return (
      <div className="import-sheet" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <div className="import-sheet-header">
          <p className="top-bar-subtitle">Import depuis {pending.source}</p>
          <h2 id="import-title">{articles(pending.items.length)} à ajouter</h2>
        </div>
        <div className="import-sheet-body">
          <p>Chargement de vos listes…</p>
        </div>
        <div className="import-sheet-actions">
          <button className="btn-text" onClick={clearPending}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <ImportSheet
      key={pendingId}
      payload={pending}
      lists={listRows}
      listTypes={listTypes}
      knownCategories={knownCategories}
      onCancel={clearPending}
      onConfirm={run}
    />
  );
}

interface ImportSheetProps {
  payload: ImportPayload;
  lists: ListRow[];
  listTypes: string[];
  knownCategories: string[];
  onCancel: () => void;
  onConfirm: (args: ApplyImportArgs) => Promise<void>;
}

function ImportSheet({ payload, lists, listTypes, knownCategories, onCancel, onConfirm }: ImportSheetProps) {
  const initialTarget = useMemo(
    () => pickDefaultTarget(lists, payload.listName, getLocalPref(LAST_IMPORT_LIST_KEY), `Import ${payload.source}`),
    // Calculé une fois à l'ouverture : ne pas changer la cible sous les doigts
    // de l'utilisateur si la liste des listes se rafraîchit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [targetValue, setTargetValue] = useState(initialTarget.kind === 'existing' ? initialTarget.listId : NEW_LIST);
  const [newName, setNewName] = useState(initialTarget.kind === 'new' ? initialTarget.name : '');
  const [newType, setNewType] = useState('');
  // Les types de liste peuvent arriver après l'ouverture de l'écran.
  const effectiveType = newType || defaultListType(listTypes);
  const [newShared, setNewShared] = useState(true);
  const [merge, setMerge] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(payload.items.map((_, i) => i)));
  const [busy, setBusy] = useState(false);

  const isNew = targetValue === NEW_LIST;
  const { data: existing } = useItems(isNew ? '' : targetValue);
  const selectedList = useMemo(() => [...selected].sort((a, b) => a - b), [selected]);

  const plan = useMemo(
    () => planImport(payload.items, selectedList, isNew ? [] : (existing ?? []), merge, knownCategories),
    [payload.items, selectedList, existing, isNew, merge, knownCategories],
  );
  const entryByIndex = useMemo(() => {
    const map = new Map<number, PlannedEntry>();
    for (const entry of plan) for (const i of entry.sourceIndexes) map.set(i, entry);
    return map;
  }, [plan]);

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function hintFor(index: number): string | null {
    const entry = entryByIndex.get(index);
    if (!entry) return null;
    const isFirst = entry.sourceIndexes[0] === index;
    const unit = entry.kind === 'merge' ? entry.existing.unit : entry.unit;
    if (entry.kind === 'merge') {
      if (!isFirst) return 'Regroupé ci-dessus';
      const before = formatQuantity(entry.existing.qty, unit) || 'déjà présent';
      const after = formatQuantity(entry.qty, unit);
      return after ? `Déjà dans la liste : ${before} → ${after}` : 'Déjà dans la liste';
    }
    if (entry.sourceIndexes.length > 1) {
      return isFirst ? `Regroupé : ${formatQuantity(entry.qty, unit) || `${entry.sourceIndexes.length}×`}` : 'Regroupé ci-dessus';
    }
    return null;
  }

  const canConfirm = selected.size > 0 && (!isNew || newName.trim().length > 0) && !busy;

  async function confirm() {
    if (!canConfirm) return;
    setBusy(true);
    const target: ImportTarget = isNew ? { kind: 'new', name: newName.trim() } : { kind: 'existing', listId: targetValue };
    await onConfirm({
      payload,
      target,
      newListType: effectiveType,
      newListPrivate: !newShared,
      selected: selectedList,
      merge,
      knownCategories,
      existing: isNew ? undefined : existing,
    });
  }

  const allSelected = selected.size === payload.items.length;

  return (
    <div className="import-sheet" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div className="import-sheet-header">
        <p className="top-bar-subtitle">Import depuis {payload.source}</p>
        <h2 id="import-title">{articles(payload.items.length)} à ajouter</h2>
      </div>

      <div className="import-sheet-body">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="import-label" htmlFor="import-target">
            Ajouter à
          </label>
          <select id="import-target" value={targetValue} onChange={(e) => setTargetValue(e.target.value)}>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.is_private ? '🔒 ' : ''}
                {l.name}
                {l.type ? ` · ${l.type}` : ''}
              </option>
            ))}
            <option value={NEW_LIST}>+ Nouvelle liste…</option>
          </select>

          {isNew && (
            <>
              <input placeholder="Nom de la liste" value={newName} onChange={(e) => setNewName(e.target.value)} />
              {listTypes.length > 0 && (
                <select value={effectiveType} onChange={(e) => setNewType(e.target.value)} aria-label="Type de liste">
                  {listTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}
              <label className="import-check">
                <input type="checkbox" checked={newShared} onChange={(e) => setNewShared(e.target.checked)} />
                Partager avec mon/ma partenaire
              </label>
            </>
          )}

          <label className="import-check">
            <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
            Fusionner avec les articles déjà présents (additionne les quantités)
          </label>
        </div>

        <div className="import-select-bar">
          <span>
            {selected.size}/{payload.items.length} sélectionné{selected.size > 1 ? 's' : ''}
          </span>
          <button
            className="btn-text"
            onClick={() => setSelected(allSelected ? new Set() : new Set(payload.items.map((_, i) => i)))}
          >
            {allSelected ? 'Tout décocher' : 'Tout cocher'}
          </button>
        </div>

        <ul className="import-items">
          {payload.items.map((it, i) => {
            const checked = selected.has(i);
            const meta = [formatQuantity(it.quantity, it.unit), it.category, it.recipeTitle, it.note]
              .filter(Boolean)
              .join(' · ');
            const hint = checked ? hintFor(i) : null;
            return (
              <li key={i}>
                <label className={`import-item ${checked ? '' : 'unchecked'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggle(i)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="item-name">{it.name}</div>
                    {meta && <div className="import-meta">{meta}</div>}
                    {hint && <span className="import-chip">{hint}</span>}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="import-sheet-actions">
        <button className="btn-text" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
        <button className="btn-primary" onClick={confirm} disabled={!canConfirm}>
          {busy ? 'Import…' : `Importer (${selected.size})`}
        </button>
      </div>
    </div>
  );
}
