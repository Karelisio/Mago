import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const scheme = 'com.karelisio.mago';

if (!existsSync(manifestPath)) {
  console.error(`${manifestPath} introuvable — lance "npx cap add android" avant ce script.`);
  process.exit(1);
}

let content = readFileSync(manifestPath, 'utf8');

if (content.includes(`android:scheme="${scheme}"`)) {
  console.log('Intent-filter de deep link déjà présent, rien à faire.');
  process.exit(0);
}

const deepLinkFilter = `            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${scheme}" android:host="login-callback" />
            </intent-filter>

`;

content = content.replace(/(\s*)<\/activity>/, `\n${deepLinkFilter}$1</activity>`);

writeFileSync(manifestPath, content);
console.log(`Intent-filter de deep link (${scheme}://login-callback) injecté dans AndroidManifest.xml`);
