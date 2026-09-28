import { z } from 'zod';
import type { ItemRow, ListRow } from './database.types';

// Imports externes (ex. une app de recettes) reçus par deep link :
//   mago://import?data=<base64url(JSON)>
// (le payload peut aussi être passé en dernier segment de chemin :
//   mago://import/<base64url(JSON)>). Tout ce fichier est pur (pas de React,
// pas de Supabase) pour pouvoir être testé directement — voir
// externalImport.test.ts.

export const IMPORT_SCHEME = 'mago';
export const IMPORT_HOST = 'import';

// Au-delà, on refuse sans même tenter le décodage (URL anormalement longue).
const MAX_ENCODED_LENGTH = 200_000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

// Certains producteurs envoient la quantité en texte ("2", "1,5") : on
// l'accepte tant que c'est un nombre strictement positif.
const quantitySchema = z
  .union([z.number(), z.string().trim()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n > 100_000) {
      ctx.addIssue({ code: 'custom', message: `quantité invalide (${String(v)})` });
      return z.NEVER;
    }
    return n;
  });

const importItemSchema = z.object({
  name: z.string().trim().min(1, 'nom d’article vide').max(200),
  quantity: quantitySchema,
  unit: optionalText(40),
  category: optionalText(80),
  note: optionalText(500),
  recipeTitle: optionalText(200),
});

export const importPayloadSchema = z.object({
  version: z.literal(1, { message: 'version de format non supportée' }),
  source: z.string().trim().min(1, 'source manquante').max(80),
  listName: optionalText(120),
  items: z.array(importItemSchema).min(1, 'aucun article').max(300, 'trop d’articles (300 max)'),
});

export type ImportPayload = z.infer<typeof importPayloadSchema>;
export type ImportItem = ImportPayload['items'][number];

export type ParseResult = { ok: true; payload: ImportPayload } | { ok: false; error: string };

export function base64UrlDecodeToString(input: string): string {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function base64UrlEncodeString(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildImportUrl(payload: unknown): string {
  return `${IMPORT_SCHEME}://${IMPORT_HOST}?data=${base64UrlEncodeString(JSON.stringify(payload))}`;
}

export function isImportUrl(url: string): boolean {
  return extractEncodedPayload(url) !== undefined;
}

// undefined : pas une URL d'import (à ignorer, ex. le callback de login) ;
// null : URL d'import sans payload.
function extractEncodedPayload(url: string): string | null | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== `${IMPORT_SCHEME}:` || parsed.hostname !== IMPORT_HOST) return undefined;
  const fromQuery = parsed.searchParams.get('data') ?? parsed.searchParams.get('payload');
  if (fromQuery) return fromQuery;
  const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
  return lastSegment ?? null;
}

export function validateImportPayload(raw: unknown): ParseResult {
  const result = importPayloadSchema.safeParse(raw);
  if (result.success) return { ok: true, payload: result.data };
  const issue = result.error.issues[0];
  const where = issue.path.length > 0 ? ` (${issue.path.join('.')})` : '';
  return { ok: false, error: `${issue.message}${where}` };
}

export function decodeImportPayload(encoded: string): ParseResult {
  if (encoded.length > MAX_ENCODED_LENGTH) return { ok: false, error: 'lien trop long' };
  let json: string;
  try {
    json = base64UrlDecodeToString(encoded);
  } catch {
    return { ok: false, error: 'encodage invalide (base64url attendu)' };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON invalide' };
  }
  return validateImportPayload(raw);
}

// null si l'URL n'est pas une URL d'import (les autres deep links, comme le
// callback de connexion, doivent être ignorés silencieusement).
export function parseImportUrl(url: string): ParseResult | null {
  const encoded = extractEncodedPayload(url);
  if (encoded === undefined) return null;
  if (!encoded) return { ok: false, error: 'lien d’import vide' };
  return decodeImportPayload(encoded);
}

// --- Fusion -----------------------------------------------------------------

export function normalizeKey(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function mergeKey(name: string, unit: string | null | undefined): string {
  return `${normalizeKey(name)}|${normalizeKey(unit)}`;
}

// Quantité inconnue + quantité connue = quantité connue ; deux inconnues
// restent inconnues. Arrondi pour éviter 0.1 + 0.2 = 0.30000000000000004.
export function sumQuantities(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return Math.round(((a ?? 0) + (b ?? 0)) * 1000) / 1000;
}

export function joinDistinct(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const parts = a.split(', ');
  if (parts.some((p) => normalizeKey(p) === normalizeKey(b))) return a;
  return `${a}, ${b}`;
}

// Rattache une catégorie importée à une catégorie existante de même nom
// (casse/accents ignorés) ; sinon la garde telle quelle (pas de création
// automatique dans item_categories).
export function resolveCategory(category: string | null, knownCategories: string[]): string | null {
  if (!category) return null;
  return knownCategories.find((k) => normalizeKey(k) === normalizeKey(category)) ?? category;
}

export interface PlannedAdd {
  kind: 'add';
  sourceIndexes: number[];
  name: string;
  qty: number | null;
  unit: string | null;
  category: string | null;
  note: string | null;
  recipeTitle: string | null;
}

export interface PlannedMerge {
  kind: 'merge';
  sourceIndexes: number[];
  existing: ItemRow;
  qty: number | null;
  category: string | null;
  note: string | null;
  recipeTitle: string | null;
}

export type PlannedEntry = PlannedAdd | PlannedMerge;

// items : le payload complet ; selected : indexes cochés dans l'écran de
// confirmation. Avec merge, les doublons du payload sont regroupés entre eux
// (même nom + même unité) puis fusionnés avec un article encore à acheter de
// la liste cible (non coché, non vidé) ; un article déjà coché n'est jamais
// réutilisé — on en recrée un, puisqu'il faut le racheter.
export function planImport(
  items: ImportItem[],
  selected: number[],
  existing: ItemRow[],
  merge: boolean,
  knownCategories: string[] = [],
): PlannedEntry[] {
  const adds: PlannedAdd[] = [];
  const byKey = new Map<string, PlannedAdd>();

  for (const index of selected) {
    const item = items[index];
    if (!item) continue;
    const key = mergeKey(item.name, item.unit);
    const previous = merge ? byKey.get(key) : undefined;
    if (previous) {
      previous.sourceIndexes.push(index);
      previous.qty = sumQuantities(previous.qty, item.quantity);
      previous.note = joinDistinct(previous.note, item.note);
      previous.recipeTitle = joinDistinct(previous.recipeTitle, item.recipeTitle);
      previous.category = previous.category ?? resolveCategory(item.category, knownCategories);
      continue;
    }
    const add: PlannedAdd = {
      kind: 'add',
      sourceIndexes: [index],
      name: item.name,
      qty: item.quantity,
      unit: item.unit,
      category: resolveCategory(item.category, knownCategories),
      note: item.note,
      recipeTitle: item.recipeTitle,
    };
    adds.push(add);
    byKey.set(key, add);
  }

  if (!merge) return adds;

  const activeByKey = new Map<string, ItemRow>();
  for (const row of existing) {
    if (row.completed || !row.is_relevant) continue;
    const key = mergeKey(row.name, row.unit);
    if (!activeByKey.has(key)) activeByKey.set(key, row);
  }

  return adds.map((add): PlannedEntry => {
    const target = activeByKey.get(mergeKey(add.name, add.unit));
    if (!target) return add;
    return {
      kind: 'merge',
      sourceIndexes: add.sourceIndexes,
      existing: target,
      qty: sumQuantities(target.qty, add.qty),
      category: target.category ?? add.category,
      note: joinDistinct(target.note, add.note),
      recipeTitle: joinDistinct(target.recipe_title, add.recipeTitle),
    };
  });
}

export type ImportTarget = { kind: 'existing'; listId: string } | { kind: 'new'; name: string };

// Liste cible proposée par défaut : celle qui porte le nom demandé par le
// payload, sinon une nouvelle liste de ce nom ; sans nom, la dernière liste
// utilisée pour un import, sinon la plus ancienne, sinon une nouvelle liste.
export function pickDefaultTarget(
  lists: ListRow[],
  listName: string | null,
  lastTargetId: string,
  fallbackName: string,
): ImportTarget {
  if (listName) {
    const match = lists.find((l) => normalizeKey(l.name) === normalizeKey(listName));
    return match ? { kind: 'existing', listId: match.id } : { kind: 'new', name: listName };
  }
  if (lastTargetId && lists.some((l) => l.id === lastTargetId)) return { kind: 'existing', listId: lastTargetId };
  if (lists.length > 0) return { kind: 'existing', listId: lists[0].id };
  return { kind: 'new', name: fallbackName };
}

export function formatQuantity(qty: number | null, unit: string | null): string {
  return [qty, unit].filter((v) => v !== null && v !== '').join(' ');
}
