#!/usr/bin/env node
// @material/material-color-utilities 0.4.0 (seule version avec le spec couleur
// 2025 « Material 3 Expressive ») publie des imports relatifs sans extension,
// ex. '../dynamiccolor/dynamic_scheme'. Les bundlers les résolvent, pas Node :
// la config Vite et les tests, qui importent src/lib/theme.ts sous Node,
// échoueraient. Lancé en postinstall, ce script ajoute « .js » aux imports
// concernés. Idempotent ; sans effet une fois le paquet corrigé en amont.

import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '@material', 'material-color-utilities');

if (existsSync(pkg)) {
  let fixed = 0;
  for (const entry of await readdir(pkg, { recursive: true })) {
    if (!entry.endsWith('.js')) continue;
    const file = join(pkg, entry);
    const source = await readFile(file, 'utf8');
    const patched = source.replace(/(\bfrom\s*['"])(\.\.?\/[^'"]+)(['"])/g, (match, head, specifier, tail) => {
      if (/\.(c|m)?js$|\.json$/.test(specifier) || !existsSync(join(dirname(file), `${specifier}.js`))) return match;
      fixed++;
      return `${head}${specifier}.js${tail}`;
    });
    if (patched !== source) await writeFile(file, patched);
  }
  if (fixed > 0) console.log(`material-color-utilities : ${fixed} import(s) sans extension corrigé(s) pour Node.`);
}
