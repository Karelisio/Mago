import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const permission = 'android.permission.REQUEST_INSTALL_PACKAGES';

if (!existsSync(manifestPath)) {
  console.error(`${manifestPath} introuvable — lance "npx cap add android" avant ce script.`);
  process.exit(1);
}

let content = readFileSync(manifestPath, 'utf8');

if (content.includes(permission)) {
  console.log('Permission REQUEST_INSTALL_PACKAGES déjà présente, rien à faire.');
  process.exit(0);
}

// Nécessaire pour que l'installeur de paquets accepte de traiter l'intent
// ACTION_VIEW déclenché par ApkInstallerPlugin (mise à jour in-app).
content = content.replace(
  '<uses-permission android:name="android.permission.INTERNET" />',
  `<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="${permission}" />`,
);

writeFileSync(manifestPath, content);
console.log('Permission REQUEST_INSTALL_PACKAGES ajoutée à AndroidManifest.xml');
