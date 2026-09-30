// Quantité saisie à la main (ListDetail) : un clavier français donne « 1,5 »,
// que Number() lit comme NaN — devenu null dans la file de sync, la quantité
// était perdue sans le moindre message. Virgule ou point acceptés ; vide =
// pas de quantité. Mêmes bornes que l'import externe (externalImport.ts).
export const MAX_QUANTITY = 100_000;

export type QuantityInput = { ok: true; value: number | null } | { ok: false };

export function parseQuantity(input: string): QuantityInput {
  const text = input.trim();
  if (text === '') return { ok: true, value: null };
  const normalized = text.replace(',', '.');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return { ok: false };
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > MAX_QUANTITY) return { ok: false };
  return { ok: true, value };
}

// Affichage / pré-remplissage à la française (1.5 → « 1,5 »), relu tel quel
// par parseQuantity.
export function formatQuantityInput(qty: number | null): string {
  return qty == null ? '' : String(qty).replace('.', ',');
}
