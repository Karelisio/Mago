import { describe, expect, it } from 'vitest';
import type { ItemRow, ListRow } from './database.types';
import {
  base64UrlDecodeToString,
  base64UrlEncodeString,
  buildImportUrl,
  formatQuantity,
  parseImportUrl,
  pickDefaultTarget,
  planImport,
  sumQuantities,
  validateImportPayload,
  type ImportItem,
} from './externalImport';

const validPayload = {
  version: 1,
  source: 'Recettes',
  listName: 'Courses',
  items: [
    { name: 'Tomates', quantity: 3, unit: null, category: 'Légumes', note: null, recipeTitle: 'Ratatouille' },
    { name: 'Crème fraîche', quantity: 20, unit: 'cl', category: null, note: 'épaisse', recipeTitle: null },
  ],
};

function item(partial: Partial<ImportItem> & { name: string }): ImportItem {
  return { quantity: null, unit: null, category: null, note: null, recipeTitle: null, ...partial };
}

function row(partial: Partial<ItemRow> & { name: string }): ItemRow {
  return {
    id: `id-${partial.name}`,
    list_id: 'list-1',
    qty: null,
    unit: null,
    category: null,
    note: null,
    recipe_title: null,
    completed: false,
    is_relevant: true,
    added_by: 'u',
    last_modified_by: 'u',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('décodage', () => {
  it('fait l’aller-retour base64url avec des caractères non ASCII', () => {
    const text = '{"a":"Crème brûlée — œufs ✓"}';
    const encoded = base64UrlEncodeString(text);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(base64UrlDecodeToString(encoded)).toBe(text);
  });

  it('décode une URL mago://import?data=…', () => {
    const result = parseImportUrl(buildImportUrl(validPayload));
    expect(result).toEqual({ ok: true, payload: expect.objectContaining({ source: 'Recettes' }) });
  });

  it('accepte le payload en dernier segment de chemin', () => {
    const encoded = buildImportUrl(validPayload).split('data=')[1];
    const result = parseImportUrl(`mago://import/${encoded}`);
    expect(result?.ok).toBe(true);
  });

  it('ignore les URL qui ne sont pas des imports', () => {
    expect(parseImportUrl('com.karelisio.mago://login-callback#access_token=x')).toBeNull();
    expect(parseImportUrl('mago://autre?data=abc')).toBeNull();
    expect(parseImportUrl('pas une url')).toBeNull();
  });

  it('rejette un base64 invalide ou un JSON invalide', () => {
    expect(parseImportUrl('mago://import?data=%%%')).toEqual({ ok: false, error: expect.stringContaining('encodage') });
    expect(parseImportUrl(`mago://import?data=${base64UrlEncodeString('{pas du json')}`)).toEqual({
      ok: false,
      error: 'JSON invalide',
    });
  });

  it('rejette un lien d’import sans payload', () => {
    expect(parseImportUrl('mago://import')).toEqual({ ok: false, error: expect.stringContaining('vide') });
  });
});

describe('validation', () => {
  it('normalise les champs texte vides en null et convertit les quantités texte', () => {
    const result = validateImportPayload({
      version: 1,
      source: ' Recettes ',
      items: [{ name: ' Farine ', quantity: '1,5', unit: '', category: '  ' }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.source).toBe('Recettes');
    expect(result.payload.listName).toBeNull();
    expect(result.payload.items[0]).toEqual({
      name: 'Farine',
      quantity: 1.5,
      unit: null,
      category: null,
      note: null,
      recipeTitle: null,
    });
  });

  it.each([
    ['version inconnue', { ...validPayload, version: 2 }, 'version'],
    ['sans source', { ...validPayload, source: '' }, 'source'],
    ['sans article', { ...validPayload, items: [] }, 'aucun article'],
    ['nom vide', { ...validPayload, items: [{ name: '  ' }] }, 'nom'],
    ['quantité négative', { ...validPayload, items: [{ name: 'Sel', quantity: -1 }] }, 'quantité'],
    ['quantité non numérique', { ...validPayload, items: [{ name: 'Sel', quantity: 'beaucoup' }] }, 'quantité'],
    ['pas un objet', 'hello', ''],
  ])('rejette : %s', (_label, raw, fragment) => {
    const result = validateImportPayload(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(fragment);
  });
});

describe('fusion', () => {
  it('additionne les quantités d’un article déjà présent (même nom et unité, casse/accents ignorés)', () => {
    const existing = [row({ name: 'Crème Fraiche', qty: 10, unit: 'CL' })];
    const plan = planImport([item({ name: 'crème fraîche', quantity: 20, unit: 'cl' })], [0], existing, true);
    expect(plan).toEqual([expect.objectContaining({ kind: 'merge', qty: 30, existing: existing[0] })]);
  });

  it('ne fusionne pas si l’unité diffère', () => {
    const existing = [row({ name: 'Lait', qty: 1, unit: 'l' })];
    const plan = planImport([item({ name: 'Lait', quantity: 50, unit: 'cl' })], [0], existing, true);
    expect(plan).toEqual([expect.objectContaining({ kind: 'add', qty: 50, unit: 'cl' })]);
  });

  it('ne réutilise pas un article déjà coché ou vidé', () => {
    const existing = [row({ name: 'Pain', completed: true }), row({ name: 'Beurre', is_relevant: false })];
    const plan = planImport([item({ name: 'Pain' }), item({ name: 'Beurre' })], [0, 1], existing, true);
    expect(plan.map((p) => p.kind)).toEqual(['add', 'add']);
  });

  it('regroupe les doublons du payload et joint les recettes', () => {
    const items = [
      item({ name: 'Oignon', quantity: 1, recipeTitle: 'Soupe' }),
      item({ name: 'oignon', quantity: 2, recipeTitle: 'Tarte' }),
      item({ name: 'Oignon', quantity: null, recipeTitle: 'soupe' }),
    ];
    const plan = planImport(items, [0, 1, 2], [], true);
    expect(plan).toEqual([
      expect.objectContaining({ kind: 'add', sourceIndexes: [0, 1, 2], qty: 3, recipeTitle: 'Soupe, Tarte' }),
    ]);
  });

  it('sans fusion, chaque article sélectionné est ajouté tel quel', () => {
    const existing = [row({ name: 'Oignon', qty: 1 })];
    const items = [item({ name: 'Oignon', quantity: 1 }), item({ name: 'Oignon', quantity: 2 })];
    const plan = planImport(items, [0, 1], existing, false);
    expect(plan.map((p) => [p.kind, p.qty])).toEqual([
      ['add', 1],
      ['add', 2],
    ]);
  });

  it('ignore les articles décochés', () => {
    const items = [item({ name: 'A' }), item({ name: 'B' }), item({ name: 'C' })];
    const plan = planImport(items, [0, 2], [], true);
    expect(plan.map((p) => (p.kind === 'add' ? p.name : ''))).toEqual(['A', 'C']);
  });

  it('rattache la catégorie importée à une catégorie existante', () => {
    const plan = planImport([item({ name: 'Tomates', category: 'legumes' })], [0], [], true, ['Légumes']);
    expect(plan[0].category).toBe('Légumes');
  });

  it('additionne les quantités inconnues de façon prévisible', () => {
    expect(sumQuantities(null, null)).toBeNull();
    expect(sumQuantities(null, 2)).toBe(2);
    expect(sumQuantities(0.1, 0.2)).toBe(0.3);
  });
});

describe('liste cible par défaut', () => {
  const lists = [
    { id: 'l1', name: 'Courses', created_at: '1' },
    { id: 'l2', name: 'Cadeaux', created_at: '2' },
  ] as ListRow[];

  it('reprend la liste du même nom', () => {
    expect(pickDefaultTarget(lists, 'courses', '', 'Import')).toEqual({ kind: 'existing', listId: 'l1' });
  });

  it('propose de créer la liste nommée si elle n’existe pas', () => {
    expect(pickDefaultTarget(lists, 'Apéro', 'l2', 'Import')).toEqual({ kind: 'new', name: 'Apéro' });
  });

  it('sans nom : dernière cible, sinon la plus ancienne, sinon une nouvelle', () => {
    expect(pickDefaultTarget(lists, null, 'l2', 'Import')).toEqual({ kind: 'existing', listId: 'l2' });
    expect(pickDefaultTarget(lists, null, 'supprimée', 'Import')).toEqual({ kind: 'existing', listId: 'l1' });
    expect(pickDefaultTarget([], null, '', 'Import Recettes')).toEqual({ kind: 'new', name: 'Import Recettes' });
  });
});

describe('formatQuantity', () => {
  it('affiche la quantité à la française, avec l’unité', () => {
    expect(formatQuantity(1.5, 'kg')).toBe('1,5 kg');
    expect(formatQuantity(3, null)).toBe('3');
    expect(formatQuantity(null, 'g')).toBe('g');
    expect(formatQuantity(null, null)).toBe('');
  });
});
