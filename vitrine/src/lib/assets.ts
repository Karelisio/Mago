import type { Asset } from '../types';
import type { IconName } from './icons';

export type AssetKind = 'android' | 'windows' | 'mac' | 'linux' | 'archive' | 'java' | 'pdf' | 'checksum' | 'file';

const RULES: Array<[RegExp, AssetKind]> = [
  [/\.(sha(1|256|512)(sum)?|md5|sig|asc|minisig|sbom\.json)$|checksums?/i, 'checksum'],
  [/\.(apk|aab|apks|xapk)$/i, 'android'],
  [/\.(exe|msi|msix|appx)$/i, 'windows'],
  [/\.(dmg|pkg)$|darwin|macos/i, 'mac'],
  [/\.(appimage|deb|rpm|flatpak|snap)$|linux/i, 'linux'],
  [/\.jar$/i, 'java'],
  [/\.pdf$/i, 'pdf'],
  [/\.(zip|7z|rar|tar|tgz|gz|bz2|xz|zst)$/i, 'archive'],
];

export function assetKind(name: string): AssetKind {
  return RULES.find(([re]) => re.test(name))?.[1] ?? 'file';
}

const ICONS: Record<AssetKind, IconName> = {
  android: 'android',
  windows: 'desktop_windows',
  mac: 'laptop_mac',
  linux: 'terminal',
  archive: 'folder_zip',
  java: 'deployed_code',
  pdf: 'picture_as_pdf',
  checksum: 'description',
  file: 'download',
};

export const assetIcon = (kind: AssetKind): IconName => ICONS[kind];

// Ordre d'affichage : exécutables d'abord (APK en tête), sommes de contrôle en dernier.
const PRIORITY: Record<AssetKind, number> = {
  android: 0,
  windows: 1,
  mac: 1,
  linux: 1,
  java: 2,
  archive: 3,
  file: 4,
  pdf: 5,
  checksum: 9,
};

export function sortAssets(assets: readonly Asset[]): Asset[] {
  return [...assets].sort(
    (a, b) => PRIORITY[assetKind(a.name)] - PRIORITY[assetKind(b.name)] || b.downloads - a.downloads || a.name.localeCompare(b.name),
  );
}
