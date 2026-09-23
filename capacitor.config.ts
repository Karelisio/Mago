import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.karelisio.mago',
  appName: 'Mago',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
