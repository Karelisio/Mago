// Tags de release : v<version de package.json>-<n° de run CI>, ex.
// v0.1.0-32. Comparés numériquement partie par partie (numéro de build
// compris) : « v0.1.0-100 » est plus récent que « v0.1.0-32 », et une
// release plus ANCIENNE que la version installée n'est jamais proposée.
function versionParts(tag: string): number[] {
  return (tag.match(/\d+/g) ?? []).map(Number);
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionParts(candidate);
  const b = versionParts(current);
  if (a.length === 0 || b.length === 0) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
