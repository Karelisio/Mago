const TONE_COUNT = 6;

// Attribue un ton de couleur stable à une catégorie/type géré à la volée
// par l'utilisateur (pas de nom fixe possible par valeur comme avant).
// Même nom -> même ton, tant que la liste des tons CSS (.list-dot.tone-N
// dans theme.css) ne change pas de taille.
export function categoryTone(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash % TONE_COUNT;
}
