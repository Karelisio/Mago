import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const packageDir = 'android/app/src/main/java/com/karelisio/mago';
const mainActivityPath = join(packageDir, 'MainActivity.java');
const templatesDir = 'android-templates';

if (!existsSync(mainActivityPath)) {
  console.error(`${mainActivityPath} introuvable — lance "npx cap add android" avant ce script.`);
  process.exit(1);
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
