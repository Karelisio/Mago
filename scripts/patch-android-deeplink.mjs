import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';

// Chaque deep link est injecté indépendamment (idempotent) dans l'activité
// principale : le callback du lien magique de connexion, et les imports
// externes (mago://import, voir src/lib/externalImport.ts). Tous deux sont
// reçus côté JS via @capacitor/app (appUrlOpen / getLaunchUrl).
const deepLinks = [
  { scheme: 'com.karelisio.mago', host: 'login-callback' },
  { scheme: 'mago', host: 'import' },
];

if (!existsSync(manifestPath)) {
  console.error(`${manifestPath} introuvable — lance "npx cap add android" avant ce script.`);
  process.exit(1);
}

let content = readFileSync(manifestPath, 'utf8');

for (const { scheme, host } of deepLinks) {
  const dataTag = `<data android:scheme="${scheme}" android:host="${host}" />`;
  if (content.includes(dataTag)) {
    console.log(`Deep link ${scheme}://${host} déjà présent, rien à faire.`);
    continue;
  }

  const filter = `            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                ${dataTag}
            </intent-filter>

`;
  content = content.replace(/(\s*)<\/activity>/, `\n${filter}$1</activity>`);
  console.log(`Intent-filter de deep link (${scheme}://${host}) injecté dans AndroidManifest.xml`);
}

writeFileSync(manifestPath, content);
