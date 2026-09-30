import { assetIcon, assetKind } from '../lib/assets';
import { formatBytes, formatInteger } from '../lib/format';
import type { Asset } from '../types';
import { Icon } from './Icon';

const VARIANTS = {
  filled: 'bg-accent text-on-accent shadow-[var(--elevation-1)] hover:shadow-[var(--elevation-3)]',
  tonal: 'bg-accent-container text-on-accent-container',
  outlined: 'border border-accent-outline text-on-surface',
} as const;

interface AssetButtonProps {
  asset: Asset;
  variant?: keyof typeof VARIANTS;
  className?: string;
}

/** Lien de téléchargement direct d'un asset de release (APK, zip…). */
export function AssetButton({ asset, variant = 'tonal', className = '' }: AssetButtonProps) {
  const downloads = `${formatInteger(asset.downloads)} téléchargement${asset.downloads >= 2 ? 's' : ''}`;
  return (
    <a
      href={asset.url}
      rel="nofollow noopener"
      title={`${asset.name} · ${formatBytes(asset.size)} · ${downloads}`}
      className={`state-layer press-morph inline-flex h-10 max-w-full min-w-0 items-center gap-2 rounded-full pr-4 pl-3 text-sm font-semibold ${VARIANTS[variant]} ${className}`}
    >
      <Icon name={assetIcon(assetKind(asset.name))} filled className="text-[1.15rem]" />
      <span className="min-w-0 truncate">{asset.name}</span>
      <span className="shrink-0 font-normal opacity-75">{formatBytes(asset.size)}</span>
    </a>
  );
}
