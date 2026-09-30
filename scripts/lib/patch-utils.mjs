// Aides partagées par les scripts qui patchent le projet Android généré
// (android/ est recréé à chaque build CI par `npx cap add android`, voir
// CLAUDE.md). Un motif attendu introuvable — template Capacitor qui a
// changé — doit ARRÊTER le build : sinon le script « réussit » sans rien
// modifier, et l'erreur n'apparaît qu'à l'exécution sur le téléphone
// (plugin non enregistré, permission absente, widget non déclaré…).

export function fail(message) {
  console.error(`ERREUR : ${message}`);
  process.exit(1);
}

function matches(content, pattern) {
  if (typeof pattern === 'string') return content.includes(pattern);
  return new RegExp(pattern.source, pattern.flags.replace('g', '')).test(content);
}

// Remplace la première occurrence de `pattern` (chaîne ou RegExp), ou arrête
// le build si elle est introuvable.
export function replaceOrFail(content, pattern, replacement, what) {
  if (!matches(content, pattern)) {
    fail(`${what} : motif attendu introuvable (${pattern}). Le template Capacitor a changé ? Adapter le script.`);
  }
  return content.replace(pattern, replacement);
}

// Vérification finale : le résultat attendu est bien présent (patch appliqué
// maintenant ou lors d'un passage précédent — les scripts sont idempotents).
export function assertIncludes(content, needle, what) {
  if (!content.includes(needle)) fail(`${what} : « ${needle} » absent après le patch.`);
}
