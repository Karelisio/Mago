import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const packageDir = 'android/app/src/main/java/com/karelisio/mago';
const mainActivityPath = join(packageDir, 'MainActivity.java');
const rootGradlePath = 'android/build.gradle';
const appGradlePath = 'android/app/build.gradle';
const templatesDir = 'android-templates';
const KOTLIN_VERSION = '1.9.24';

if (!existsSync(mainActivityPath)) {
  console.error(`${mainActivityPath} introuvable — lance "npx cap add android" avant ce script.`);
  process.exit(1);
}

// Le template Capacitor n'a pas le support Kotlin activé par défaut : sans ça,
// MainActivity.java (compilé en Java) ne peut pas voir les classes .kt et le
// build échoue avec "cannot find symbol".
let rootGradle = readFileSync(rootGradlePath, 'utf8');
if (!rootGradle.includes('kotlin-gradle-plugin')) {
  rootGradle = rootGradle.replace(
    "classpath 'com.android.tools.build:gradle:8.2.1'",
    `classpath 'com.android.tools.build:gradle:8.2.1'\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:${KOTLIN_VERSION}'`,
  );
  writeFileSync(rootGradlePath, rootGradle);
  console.log('Plugin Gradle Kotlin ajouté à android/build.gradle');
}

let appGradle = readFileSync(appGradlePath, 'utf8');
if (!appGradle.includes("apply plugin: 'kotlin-android'")) {
  appGradle = appGradle
    .replace(
      "apply plugin: 'com.android.application'",
      "apply plugin: 'com.android.application'\napply plugin: 'kotlin-android'",
    )
    .replace(
      "implementation fileTree(include: ['*.jar'], dir: 'libs')",
      `implementation fileTree(include: ['*.jar'], dir: 'libs')\n    implementation "org.jetbrains.kotlin:kotlin-stdlib:${KOTLIN_VERSION}"`,
    );
  writeFileSync(appGradlePath, appGradle);
  console.log('Plugin kotlin-android + stdlib ajoutés à android/app/build.gradle');
}

// Firebase Cloud Messaging (widget écran d'accueil, Phase 2+). Le template
// Capacitor applique déjà conditionnellement le plugin google-services (si
// android/app/google-services.json existe au moment du build — voir le bas
// de app/build.gradle) : rien à faire de ce côté, seulement ajouter les
// dépendances Firebase Messaging elles-mêmes.
appGradle = readFileSync(appGradlePath, 'utf8');
if (!appGradle.includes('com.google.firebase:firebase-messaging')) {
  appGradle = appGradle.replace(
    `implementation "org.jetbrains.kotlin:kotlin-stdlib:${KOTLIN_VERSION}"`,
    [
      `implementation "org.jetbrains.kotlin:kotlin-stdlib:${KOTLIN_VERSION}"`,
      `    implementation platform('com.google.firebase:firebase-bom:33.5.1')`,
      `    implementation 'com.google.firebase:firebase-messaging'`,
    ].join('\n'),
  );
  writeFileSync(appGradlePath, appGradle);
  console.log('Dépendances Firebase Messaging ajoutées à android/app/build.gradle');
}

mkdirSync(packageDir, { recursive: true });
const pluginFiles = ['DynamicColorPlugin.kt', 'ApkInstallerPlugin.kt', 'PushTokenPlugin.kt', 'WidgetBridgePlugin.kt'];
for (const file of pluginFiles) {
  copyFileSync(join(templatesDir, file), join(packageDir, file));
}
console.log(pluginFiles.join(' + '), 'copiés dans', packageDir);

// Enregistre chaque plugin manquant dans MainActivity.java (idempotent, un
// plugin déjà enregistré est laissé tel quel).
const pluginClasses = pluginFiles.map((f) => f.replace('.kt', ''));
let mainActivity = readFileSync(mainActivityPath, 'utf8');

if (!mainActivity.includes('onCreate(Bundle savedInstanceState)')) {
  mainActivity = mainActivity
    .replace(
      "import com.getcapacitor.BridgeActivity;",
      "import android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;",
    )
    .replace(
      /public class MainActivity extends BridgeActivity \{\}/,
      [
        'public class MainActivity extends BridgeActivity {',
        '    @Override',
        '    public void onCreate(Bundle savedInstanceState) {',
        '        super.onCreate(savedInstanceState);',
        '    }',
        '}',
      ].join('\n'),
    );
}

let registeredAny = false;
for (const className of pluginClasses) {
  const registration = `registerPlugin(${className}.class);`;
  if (!mainActivity.includes(registration)) {
    mainActivity = mainActivity.replace(
      'super.onCreate(savedInstanceState);',
      `${registration}\n        super.onCreate(savedInstanceState);`,
    );
    registeredAny = true;
  }
}

if (registeredAny) {
  writeFileSync(mainActivityPath, mainActivity);
  console.log('Plugins manquants enregistrés dans MainActivity.java');
} else {
  console.log('Plugins déjà enregistrés dans MainActivity.java, rien à faire.');
}

const resDir = 'android/app/src/main/res';

// Widget écran d'accueil + service FCM (Phase 3). Ce ne sont PAS des plugins
// Capacitor (AppWidgetProvider / FirebaseMessagingService sont des classes du
// framework Android standard) : on les copie directement, sans passer par
// registerPlugin(). Le receiver/service sont déclarés dans AndroidManifest.xml
// par patch-android-widget-manifest.mjs, pas ici.
const widgetTemplatesDir = join(templatesDir, 'widget');
for (const file of ['MagoFcmService.kt', 'MagoWidgetProvider.kt']) {
  copyFileSync(join(templatesDir, file), join(packageDir, file));
}
console.log('MagoFcmService.kt + MagoWidgetProvider.kt copiés dans', packageDir);

mkdirSync(join(resDir, 'xml'), { recursive: true });
copyFileSync(join(widgetTemplatesDir, 'widget_info.xml'), join(resDir, 'xml', 'widget_info.xml'));

mkdirSync(join(resDir, 'layout'), { recursive: true });
copyFileSync(join(widgetTemplatesDir, 'widget_list_glance.xml'), join(resDir, 'layout', 'widget_list_glance.xml'));

mkdirSync(join(resDir, 'drawable'), { recursive: true });
copyFileSync(join(widgetTemplatesDir, 'widget_background.xml'), join(resDir, 'drawable', 'widget_background.xml'));
copyFileSync(join(widgetTemplatesDir, 'widget_checkbox_unchecked.xml'), join(resDir, 'drawable', 'widget_checkbox_unchecked.xml'));
copyFileSync(join(widgetTemplatesDir, 'widget_checkbox_checked.xml'), join(resDir, 'drawable', 'widget_checkbox_checked.xml'));

// Couleurs du widget : clair/sombre en repli statique + variante Android 12+
// pointant vers les tons dynamiques du système (mêmes tons que
// DynamicColorPlugin.kt, mais consommés directement en XML ici).
mkdirSync(join(resDir, 'values'), { recursive: true });
copyFileSync(join(widgetTemplatesDir, 'widget_colors_light.xml'), join(resDir, 'values', 'widget_colors.xml'));

mkdirSync(join(resDir, 'values-night'), { recursive: true });
copyFileSync(join(widgetTemplatesDir, 'widget_colors_night.xml'), join(resDir, 'values-night', 'widget_colors.xml'));

mkdirSync(join(resDir, 'values-v31'), { recursive: true });
copyFileSync(join(widgetTemplatesDir, 'widget_colors_v31.xml'), join(resDir, 'values-v31', 'widget_colors.xml'));

mkdirSync(join(resDir, 'values-night-v31'), { recursive: true });
copyFileSync(join(widgetTemplatesDir, 'widget_colors_night_v31.xml'), join(resDir, 'values-night-v31', 'widget_colors.xml'));

console.log('Ressources du widget (xml/layout/drawable/couleurs) copiées dans res/');

// Icône de l'app (liste à cocher + deux anneaux entrelacés pour le couple,
// motif partagé avec les autres apps de la même famille). L'icône adaptive
// (Android 8+) référence des vector drawables directement : pas besoin de
// rasteriser quoi que ce soit pour ça. Seuls les mipmaps legacy (Android < 8,
// ic_launcher.png / ic_launcher_round.png) doivent être des PNG déjà aplatis.
const iconTemplatesDir = join(templatesDir, 'icon');

// Le template Capacitor stock embarque déjà un ic_launcher_foreground.xml
// (son propre dégradé par défaut) dans res/drawable-v24/ — un dossier avec
// un qualificatif PLUS spécifique que notre res/drawable/ non qualifié.
// Android résout toujours le qualificatif le plus spécifique en premier,
// donc sans ça notre icône ne serait jamais choisie sur un appareil réel
// (API 24+), même si aapt2 compile les deux fichiers sans erreur. On
// supprime donc toute variante stock (quel que soit son qualificatif
// drawable-*) avant de copier la nôtre dans le dossier non qualifié.
for (const entry of readdirSync(resDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('drawable')) continue;
  const dir = join(resDir, entry.name);
  for (const file of readdirSync(dir)) {
    if (/^ic_launcher_(foreground|monochrome)\.(xml|png)$/.test(file)) {
      unlinkSync(join(dir, file));
    }
  }
}

mkdirSync(join(resDir, 'drawable'), { recursive: true });
copyFileSync(join(iconTemplatesDir, 'ic_launcher_foreground.xml'), join(resDir, 'drawable', 'ic_launcher_foreground.xml'));
copyFileSync(join(iconTemplatesDir, 'ic_launcher_monochrome.xml'), join(resDir, 'drawable', 'ic_launcher_monochrome.xml'));
console.log('Vecteurs de l\'icône (foreground + monochrome) copiés dans res/drawable (variantes stock qualifiées supprimées)');

// Le template Capacitor génère ce fichier avec un fond blanc par défaut ;
// on le remplace par le ton pêche de la palette Mago (assorti au fond du
// dégradé de l'app, cohérent avec le reste de l'identité terracotta).
mkdirSync(join(resDir, 'values'), { recursive: true });
writeFileSync(
  join(resDir, 'values', 'ic_launcher_background.xml'),
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<resources>',
    '    <color name="ic_launcher_background">#FFDBC7</color>',
    '</resources>',
    '',
  ].join('\n'),
);
console.log('Fond de l\'icône adaptive recoloré en pêche (#FFDBC7)');

for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const adaptiveIconPath = join(resDir, 'mipmap-anydpi-v26', name);
  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
    '    <background android:drawable="@color/ic_launcher_background"/>',
    '    <foreground android:drawable="@drawable/ic_launcher_foreground"/>',
    '    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>',
    '</adaptive-icon>',
    '',
  ].join('\n');
  writeFileSync(adaptiveIconPath, xml);
}
console.log('mipmap-anydpi-v26/ic_launcher(_round).xml pointés vers l\'icône Mago (+ support icônes thémées)');

const legacyDensities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
for (const density of legacyDensities) {
  const src = join(iconTemplatesDir, 'legacy', `ic_launcher-${density}.png`);
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    copyFileSync(src, join(resDir, `mipmap-${density}`, name));
  }
}
console.log('Icônes legacy (Android < 8) remplacées pour toutes les densités');
