import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { assertIncludes, fail, replaceOrFail } from './lib/patch-utils.mjs';

const manifestPath = 'android/app/src/main/AndroidManifest.xml';

if (!existsSync(manifestPath)) {
  fail(`${manifestPath} introuvable — lance "npx cap add android" avant ce script.`);
}

let content = readFileSync(manifestPath, 'utf8');

if (content.includes('MagoWidgetProvider')) {
  assertIncludes(content, '.MagoFcmService', 'AndroidManifest.xml');
  console.log('Widget/FCM service déjà déclarés dans AndroidManifest.xml, rien à faire.');
  process.exit(0);
}

const declarations = `        <receiver
            android:name=".MagoWidgetProvider"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <intent-filter>
                <action android:name="com.karelisio.mago.TOGGLE_ITEM" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/widget_info" />
        </receiver>

        <service
            android:name=".MagoFcmService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>

`;

content = replaceOrFail(
  content,
  /(\s*)<\/application>/,
  `\n${declarations}$1</application>`,
  'AndroidManifest.xml (receiver du widget + service FCM)',
);

writeFileSync(manifestPath, content);
console.log('Receiver du widget (MagoWidgetProvider) + service FCM (MagoFcmService) injectés dans AndroidManifest.xml');
