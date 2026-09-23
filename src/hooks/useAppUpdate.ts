import { useEffect, useState } from 'react';
import { registerPlugin, Capacitor } from '@capacitor/core';

interface ApkInstallerPlugin {
  downloadAndInstall(options: { url: string }): Promise<void>;
}

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller');

const REPO = 'Karelisio/Mago';
const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION || null;

interface LatestRelease {
  tag: string;
  changelog: string;
  apkUrl: string;
}

export function useAppUpdate() {
  const [latest, setLatest] = useState<LatestRelease | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkForUpdate() {
    if (!CURRENT_VERSION) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
      if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`);
      const data = await res.json();
      const apkAsset = (data.assets ?? []).find((a: { name: string }) => a.name === 'app-release.apk');
      if (data.tag_name && data.tag_name !== CURRENT_VERSION && apkAsset) {
        setLatest({ tag: data.tag_name, changelog: data.body ?? '', apkUrl: apkAsset.browser_download_url });
      } else {
        setLatest(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkForUpdate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function install() {
    if (!latest || !Capacitor.isNativePlatform()) return;
    setInstalling(true);
    setError(null);
    try {
      await ApkInstaller.downloadAndInstall({ url: latest.apkUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la mise à jour');
    } finally {
      setInstalling(false);
    }
  }

  return {
    currentVersion: CURRENT_VERSION,
    latest,
    checking,
    installing,
    error,
    canInstall: Capacitor.isNativePlatform(),
    checkForUpdate,
    install,
  };
}
