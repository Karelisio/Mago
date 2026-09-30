import { useMemo, useState } from 'react';
import { hexFromArgb, sourceColorFromImageBytes } from '@material/material-color-utilities';
import { CONFIG } from '../config';
import { swatchColors } from '../lib/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';

const POPOVER_ID = 'accent-popover';

const PRESETS: Array<{ color: string; label: string }> = [
  { color: '#0b57d0', label: 'Bleu' },
  { color: '#00897b', label: 'Sarcelle' },
  { color: '#3f8f2f', label: 'Vert' },
  { color: '#f28c00', label: 'Orange' },
  { color: '#e0245e', label: 'Framboise' },
  { color: '#b3261e', label: 'Rouge' },
];

/** Couleur source « Material You » extraite de l'avatar (quantification + score M3). */
async function avatarSeed(url: string): Promise<string> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = `${url}${url.includes('?') ? '&' : '?'}s=96`;
  await img.decode();
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas indisponible');
  ctx.drawImage(img, 0, 0, size, size);
  return hexFromArgb(sourceColorFromImageBytes(ctx.getImageData(0, 0, size, size).data));
}

function Swatch({
  color,
  label,
  selected,
  onSelect,
}: {
  color: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { mode } = useTheme();
  const [a, b, c] = useMemo(() => swatchColors(color, mode, CONFIG.paletteStyle), [color, mode]);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={label}
      className="press-morph group relative grid size-12 place-items-center rounded-full ring-offset-2 ring-offset-surface-container-high aria-pressed:ring-2 aria-pressed:ring-on-surface"
      style={{ background: `conic-gradient(from -90deg, ${a} 0 50%, ${c} 50% 75%, ${b} 75% 100%)` }}
    >
      <span className="sr-only">{label}</span>
      {selected && (
        <span className="grid size-6 place-items-center rounded-full bg-surface-container-high text-on-surface">
          <Icon name="check" className="text-base" />
        </span>
      )}
    </button>
  );
}

export function AccentPicker({ avatarUrl }: { avatarUrl?: string }) {
  const { seed, setSeed } = useTheme();
  const [fromAvatar, setFromAvatar] = useState<string | null>(null);
  const [avatarState, setAvatarState] = useState<'idle' | 'loading' | 'error'>('idle');
  const current = seed.toLowerCase();

  const pickAvatar = async () => {
    if (!avatarUrl) return;
    if (fromAvatar) return setSeed(fromAvatar);
    setAvatarState('loading');
    try {
      const color = await avatarSeed(avatarUrl);
      setFromAvatar(color);
      setSeed(color);
      setAvatarState('idle');
    } catch {
      setAvatarState('error');
    }
  };

  return (
    <>
      <button
        type="button"
        popoverTarget={POPOVER_ID}
        aria-label="Couleur du thème"
        title="Couleur du thème"
        className="state-layer press-morph grid size-10 place-items-center rounded-full text-on-surface-variant hover:text-on-surface"
      >
        <Icon name="palette" className="text-[1.2rem]" />
      </button>
      <div
        id={POPOVER_ID}
        popover="auto"
        className="accent-popover w-[min(20rem,calc(100vw-2rem))] rounded-[28px] bg-surface-container-high p-5 text-on-surface shadow-[var(--elevation-4)]"
      >
        <p className="type-title">Couleur du thème</p>
        <p className="mt-1 text-sm text-on-surface-variant">
          Toute la palette Material You est recalculée depuis cette couleur.
        </p>
        <div className="mt-4 grid grid-cols-4 justify-items-center gap-3">
          <Swatch
            color={CONFIG.accentColor}
            label="Couleur par défaut"
            selected={current === CONFIG.accentColor.toLowerCase()}
            onSelect={() => setSeed(null)}
          />
          {PRESETS.map((p) => (
            <Swatch key={p.color} color={p.color} label={p.label} selected={current === p.color} onSelect={() => setSeed(p.color)} />
          ))}
          <label
            title="Couleur personnalisée"
            className="press-morph relative grid size-12 cursor-pointer place-items-center rounded-full has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-primary"
            style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
          >
            <span className="grid size-6 place-items-center rounded-full bg-surface-container-high text-on-surface">
              <Icon name="palette" className="text-base" />
            </span>
            <input
              type="color"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Choisir une couleur personnalisée"
            />
          </label>
        </div>
        {avatarUrl && (
          <button
            type="button"
            onClick={pickAvatar}
            disabled={avatarState === 'loading'}
            aria-pressed={fromAvatar !== null && current === fromAvatar}
            className="state-layer press-morph mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-secondary-container px-4 text-sm font-semibold text-on-secondary-container disabled:opacity-60"
          >
            <Icon name="auto_awesome" />
            {avatarState === 'error' ? 'Avatar illisible, réessayer' : 'Couleur tirée de l’avatar'}
          </button>
        )}
      </div>
    </>
  );
}
