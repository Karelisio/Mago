import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
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

mkdirSync(packageDir, { recursive: true });
copyFileSync(join(templatesDir, 'DynamicColorPlugin.kt'), join(packageDir, 'DynamicColorPlugin.kt'));
console.log('DynamicColorPlugin.kt copié dans', packageDir);

let mainActivity = readFileSync(mainActivityPath, 'utf8');

if (!mainActivity.includes('registerPlugin(DynamicColorPlugin.class)')) {
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
        '        registerPlugin(DynamicColorPlugin.class);',
        '        super.onCreate(savedInstanceState);',
        '    }',
        '}',
      ].join('\n'),
    );

  writeFileSync(mainActivityPath, mainActivity);
  console.log('DynamicColorPlugin enregistré dans MainActivity.java');
} else {
  console.log('DynamicColorPlugin déjà enregistré dans MainActivity.java, rien à faire.');
}

// Icône de l'app (deux anneaux entrelacés, motif partagé avec les autres
// apps de la même famille). L'icône adaptive (Android 8+) référence des
// vector drawables directement : pas besoin de rasteriser quoi que ce soit
// pour ça. Seuls les mipmaps legacy (Android < 8, ic_launcher.png /
// ic_launcher_round.png) doivent être des PNG déjà aplatis.
const resDir = 'android/app/src/main/res';
const iconTemplatesDir = join(templatesDir, 'icon');

mkdirSync(join(resDir, 'drawable'), { recursive: true });
copyFileSync(join(iconTemplatesDir, 'ic_launcher_foreground.xml'), join(resDir, 'drawable', 'ic_launcher_foreground.xml'));
copyFileSync(join(iconTemplatesDir, 'ic_launcher_monochrome.xml'), join(resDir, 'drawable', 'ic_launcher_monochrome.xml'));
console.log('Vecteurs de l\'icône (foreground + monochrome) copiés dans res/drawable');

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
