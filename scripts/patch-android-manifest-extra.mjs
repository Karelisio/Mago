import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fail, replaceOrFail } from './lib/patch-utils.mjs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const permission = 'android.permission.REQUEST_INSTALL_PACKAGES';

if (!existsSync(manifestPath)) {
  fail(`${manifestPath} introuvable — lance "npx cap add android" avant ce script.`);
}

let content = readFileSync(manifestPath, 'utf8');

if (content.includes(permission)) {
  console.log('Permission REQUEST_INSTALL_PACKAGES déjà présente, rien à faire.');
  process.exit(0);
}

// Nécessaire pour que l'installeur de paquets accepte de traiter l'intent
// ACTION_VIEW déclenché par ApkInstallerPlugin (mise à jour in-app). Sans
// elle, la mise à jour échoue seulement sur le téléphone : on arrête le
// build si l'ancre (permission INTERNET du template) a disparu.
content = replaceOrFail(
  content,
  /<uses-permission\s+android:name="android\.permission\.INTERNET"\s*\/>/,
  `<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="${permission}" />`,
  'AndroidManifest.xml (permission REQUEST_INSTALL_PACKAGES)',
);

writeFileSync(manifestPath, content);
console.log('Permission REQUEST_INSTALL_PACKAGES ajoutée à AndroidManifest.xml');
