import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const gradlePath = 'android/app/build.gradle';

if (!existsSync(gradlePath)) {
  console.error(`${gradlePath} introuvable — lance "npx cap add android" avant ce script.`);
  process.exit(1);
}

let content = readFileSync(gradlePath, 'utf8');

if (content.includes('signingConfigs {')) {
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

content = content.replace('android {\n', `android {\n${signingConfigsBlock}`);

content = content.replace(
  /release \{\n(\s*)minifyEnabled/,
  'release {\n$1signingConfig signingConfigs.release\n$1minifyEnabled',
);

writeFileSync(gradlePath, content);
console.log('Signing config injectée dans android/app/build.gradle');
