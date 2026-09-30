import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { languageColor } from '../lib/languages';
import { spring } from '../lib/motion';
import { plural } from '../lib/format';
import type { IconName } from '../lib/icons';
import type { Filters, LanguageCount, ReleaseFilter, SortKey } from '../lib/repos';
import { Icon } from './Icon';

interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

/** Bouton segmenté M3 (groupe radio, flèches du clavier), indicateur glissant. */
function SegmentedButton<T extends string>({
  label,
  value,
  segments,
  onChange,
}: {
  label: string;
  value: T;
  segments: Segment<T>[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const index = segments.findIndex((s) => s.value === value);
    const next = (index + step + segments.length) % segments.length;
    onChange(segments[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="inline-flex h-10 shrink-0 items-stretch rounded-full border border-outline-variant p-[3px]"
    >
      {segments.map((s, i) => {
        const selected = s.value === value;
        return (
          <button
            key={s.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(s.value)}
            className={`state-layer relative flex items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-200 ${
              selected ? 'text-on-secondary-container' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {selected && (
              <motion.span
                layoutId={`segment-${id}`}
                className="absolute inset-0 -z-10 rounded-full bg-secondary-container"
                transition={spring.fastSpatial}
              />
            )}
            {s.icon && <Icon name={selected ? 'check' : s.icon} className="text-[1.05rem]" />}
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);

  // « / » place le curseur dans la recherche (comme sur GitHub).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="group flex h-14 min-w-0 flex-1 items-center gap-3 rounded-full bg-surface-container-high/90 px-5 shadow-[var(--elevation-1)] backdrop-blur-md transition-colors duration-200 focus-within:bg-surface-container-highest has-[input:focus-visible]:outline-3 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-primary">
      <Icon name="search" className="text-on-surface-variant" />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        placeholder="Rechercher un projet…"
        aria-label="Rechercher un projet (nom, description, topic, langage)"
        enterKeyHint="search"
        className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-on-surface-variant/80"
      />
      <AnimatePresence initial={false}>
        {value ? (
          <motion.button
            key="clear"
            type="button"
            onClick={() => {
              onChange('');
              input.current?.focus();
            }}
            aria-label="Effacer la recherche"
            className="state-layer -mr-2 grid size-10 place-items-center rounded-full text-on-surface-variant"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={spring.fastSpatial}
          >
            <Icon name="close" />
          </motion.button>
        ) : (
          <kbd
            key="hint"
            className="hidden rounded-md border border-outline-variant px-1.5 font-mono text-xs text-on-surface-variant md:inline"
          >
            /
          </kbd>
        )}
      </AnimatePresence>
    </div>
  );
}

function LanguageChip({
  language,
  selected,
  onToggle,
}: {
  language: LanguageCount;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`state-layer press-morph inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
        selected
          ? 'border-transparent bg-secondary-container text-on-secondary-container'
          : 'border-outline-variant text-on-surface-variant hover:text-on-surface'
      }`}
    >
      <AnimatePresence initial={false}>
        {selected && (
          <motion.span
            key="check"
            className="-ml-1 flex overflow-hidden"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={spring.fastSpatial}
          >
            <Icon name="check" className="text-[1.05rem]" />
          </motion.span>
        )}
      </AnimatePresence>
      <span
        aria-hidden="true"
        className="size-2.5 rounded-full ring-1 ring-outline-variant"
        style={{ background: languageColor(language.name) }}
      />
      {language.name}
      <span className="text-xs tabular-nums opacity-70">{language.count}</span>
    </button>
  );
}

const SORTS: Segment<SortKey>[] = [
  { value: 'updated', label: 'Récents', icon: 'schedule' },
  { value: 'stars', label: 'Étoiles', icon: 'star' },
  { value: 'name', label: 'Nom', icon: 'sell' },
];

const RELEASES: Segment<ReleaseFilter>[] = [
  { value: 'all', label: 'Tous' },
  { value: 'with', label: 'Avec release' },
  { value: 'without', label: 'Sans release' },
];

interface ToolbarProps {
  filters: Filters;
  languages: LanguageCount[];
  resultCount: number;
  totalCount: number;
  filtered: boolean;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
}

export function Toolbar({ filters, languages, resultCount, totalCount, filtered, onChange, onReset }: ToolbarProps) {
  const toggleLanguage = (name: string) =>
    onChange({
      languages: filters.languages.includes(name)
        ? filters.languages.filter((l) => l !== name)
        : [...filters.languages, name],
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <SearchField value={filters.query} onChange={(query) => onChange({ query })} />
        <div className="flex items-center gap-2 overflow-x-auto md:overflow-visible">
          <span className="type-label shrink-0 text-on-surface-variant md:sr-only">Trier</span>
          <SegmentedButton label="Trier par" value={filters.sort} segments={SORTS} onChange={(sort) => onChange({ sort })} />
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <SegmentedButton
            label="Filtrer par release"
            value={filters.release}
            segments={RELEASES}
            onChange={(release) => onChange({ release })}
          />
        </div>
        {languages.length > 1 && (
          <div
            role="group"
            aria-label="Filtrer par langage"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          >
            {languages.map((language) => (
              <LanguageChip
                key={language.name}
                language={language}
                selected={filters.languages.includes(language.name)}
                onToggle={() => toggleLanguage(language.name)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex min-h-9 items-center gap-3 text-sm text-on-surface-variant">
        <p aria-live="polite">
          {filtered
            ? `${plural(resultCount, 'projet')} sur ${totalCount}`
            : plural(totalCount, 'projet')}
        </p>
        <AnimatePresence>
          {filtered && (
            <motion.button
              type="button"
              onClick={onReset}
              className="state-layer inline-flex h-9 items-center gap-1.5 rounded-full px-3 font-semibold text-primary"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={spring.fastSpatial}
            >
              <Icon name="refresh" className="text-base" />
              Réinitialiser les filtres
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
