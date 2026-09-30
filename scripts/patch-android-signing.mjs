import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { assertIncludes, fail, replaceOrFail } from './lib/patch-utils.mjs';

const gradlePath = 'android/app/build.gradle';

if (!existsSync(gradlePath)) {
  fail(`${gradlePath} introuvable — lance "npx cap add android" avant ce script.`);
}

let content = readFileSync(gradlePath, 'utf8');

if (content.includes('signingConfigs {')) {
  assertIncludes(content, 'signingConfig signingConfigs.release', 'android/app/build.gradle');
  console.log('Signing config déjà présente dans build.gradle, rien à faire.');
  process.exit(0);
}

const signingConfigsBlock = `    signingConfigs {
        release {
            def keystorePropertiesFile = rootProject.file("keystore.properties")
            def keystoreProperties = new Properties()
            if (keystorePropertiesFile.exists()) {
                keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
`;

// Sans ces deux ancres, l'APK sortirait non signé (ou signé en debug) :
// l'installation par-dessus la version en place échouerait sur le téléphone.
content = replaceOrFail(
  content,
  'android {\n',
  `android {\n${signingConfigsBlock}`,
  'android/app/build.gradle (signingConfigs)',
);

content = replaceOrFail(
  content,
  /release \{\n(\s*)minifyEnabled/,
  'release {\n$1signingConfig signingConfigs.release\n$1minifyEnabled',
  'android/app/build.gradle (signingConfig du buildType release)',
);

writeFileSync(gradlePath, content);
console.log('Signing config injectée dans android/app/build.gradle');
