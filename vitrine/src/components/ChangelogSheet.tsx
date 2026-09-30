import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'framer-motion';
import { Suspense, lazy, useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { assetKind, sortAssets } from '../lib/assets';
import { formatDate, formatDateTime, formatShortDate, plural, relativeTime } from '../lib/format';
import { accentKey } from '../lib/languages';
import { emphasized, spring } from '../lib/motion';
import { latestRelease } from '../lib/repos';
import type { Release, Repo } from '../types';
import { AssetButton } from './AssetButton';
import { IconButton, LinkChip } from './Buttons';
import { ShapeMonogram } from './ExpressiveShape';
import { Icon } from './Icon';
import { Badge } from './RepoCard';

const Markdown = lazy(() => import('./Markdown'));

function NotesSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {[92, 76, 84, 58].map((w) => (
        <div key={w} className="skeleton h-3.5 rounded-full" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function ReleaseBody({ release, repo }: { release: Release; repo: Repo }) {
  const assets = sortAssets(release.assets);
  return (
    <div className="flex flex-col gap-5">
      {assets.length > 0 && (
        <div>
          <p className="type-label mb-2 text-on-surface-variant">Téléchargements</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {assets.map((asset, i) => (
              <AssetButton
                key={asset.url}
                asset={asset}
                variant={i === 0 && assetKind(asset.name) !== 'checksum' ? 'filled' : 'tonal'}
              />
            ))}
          </div>
        </div>
      )}
      {release.body.trim() ? (
        <Suspense fallback={<NotesSkeleton />}>
          <Markdown source={release.body} repository={repo.fullName} />
        </Suspense>
      ) : (
        <p className="text-sm text-on-surface-variant italic">Pas de notes pour cette version.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <LinkChip href={release.url} icon="arrow_outward">
          Voir sur GitHub
        </LinkChip>
        {release.zipballUrl && (
          <LinkChip href={release.zipballUrl} icon="folder_zip">
            Sources (.zip)
          </LinkChip>
        )}
        {release.tarballUrl && (
          <LinkChip href={release.tarballUrl} icon="folder_zip">
            Sources (.tar.gz)
          </LinkChip>
        )}
      </div>
    </div>
  );
}

function ReleaseAccordion({ release, repo, initiallyOpen }: { release: Release; repo: Repo; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const reduced = useReducedMotion();
  const contentId = useId();
  const item = useRef<HTMLLIElement>(null);

  // Version ciblée par un lien (timeline, URL) : on la fait défiler en vue
  // une fois le panneau ouvert.
  useEffect(() => {
    if (!initiallyOpen) return;
    const timer = window.setTimeout(
      () => item.current?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }),
      reduced ? 0 : 380,
    );
    return () => window.clearTimeout(timer);
  }, [initiallyOpen, reduced]);

  return (
    <li ref={item} className="scroll-mt-3 overflow-hidden rounded-[20px] bg-surface-container/70">
      <h4>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((o) => !o)}
          className="state-layer flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left"
        >
          <span className="shrink-0 rounded-full bg-accent-container px-2.5 py-0.5 text-sm font-semibold text-on-accent-container">
            {release.tag}
          </span>
          {release.prerelease && <Badge>Pré-version</Badge>}
          <span className="min-w-0 flex-1 truncate text-sm text-on-surface-variant">
            {release.name && release.name !== release.tag ? release.name : ''}
          </span>
          <time
            dateTime={release.publishedAt}
            title={formatDateTime(release.publishedAt)}
            className="shrink-0 text-sm text-on-surface-variant"
          >
            {formatShortDate(release.publishedAt)}
          </time>
          <motion.span
            className="grid shrink-0 place-items-center text-on-surface-variant"
            animate={{ rotate: open ? 180 : 0 }}
            transition={spring.fastSpatial}
          >
            <Icon name="expand_more" />
          </motion.span>
        </button>
      </h4>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={contentId}
            key="content"
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { height: { duration: 0.42, ease: emphasized }, opacity: { duration: 0.24, ease: 'easeOut' } }
            }
          >
            <div className="px-4 pt-1 pb-5">
              <ReleaseBody release={release} repo={repo} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

interface SheetProps {
  repo: Repo;
  tag: string | null;
  onClose: () => void;
}

function Sheet({ repo, tag, onClose }: SheetProps) {
  const desktop = useMediaQuery('(min-width: 768px)');
  const dragControls = useDragControls();
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const latest = latestRelease(repo);
  const others = repo.releases.filter((r) => r !== latest);

  // Page figée derrière le panneau, Échap pour fermer.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
  }, []);

  // Mobile : glisser la poignée (ou l'en-tête) vers le bas pour fermer.
  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (desktop || (e.target as HTMLElement).closest('button, a')) return;
    dragControls.start(e);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 140 || info.velocity.y > 700) onClose();
  };

  const panelMotion = desktop
    ? { initial: { x: '105%', opacity: 0.4 }, animate: { x: 0, opacity: 1 }, exit: { x: '105%', opacity: 0.4 } }
    : { initial: { y: '100%', opacity: 0.4 }, animate: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 0.4 } };

  return (
    <>
      <motion.div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-scrim/45 backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-accent={accentKey(repo.language)}
        className={
          desktop
            ? 'fixed inset-y-3 right-3 z-50 flex w-[min(42rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-sheet bg-accent-surface shadow-[var(--elevation-4)]'
            : 'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-sheet bg-accent-surface pb-[env(safe-area-inset-bottom)] shadow-[var(--elevation-4)]'
        }
        {...panelMotion}
        transition={{ ...spring.spatial, opacity: { duration: 0.2 } }}
        drag={desktop ? false : 'y'}
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={onDragEnd}
      >
        <div
          onPointerDown={startDrag}
          className={`shrink-0 border-b border-accent-outline/60 px-5 pb-4 sm:px-7 ${desktop ? 'pt-5' : 'touch-none pt-2.5'}`}
        >
          {!desktop && <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-on-surface-variant/40" />}
          <div className="flex items-center gap-4">
            <ShapeMonogram name={repo.name} className="size-12" />
            <div className="min-w-0 flex-1">
              <p className="type-label text-accent">Changelog · {plural(repo.releaseCount, 'version')}</p>
              <h2 id={titleId} className="type-title truncate">
                {repo.name}
              </h2>
            </div>
            <IconButton ref={closeButton} label="Fermer le changelog" icon="close" onClick={onClose} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-10 sm:px-7">
          {latest ? (
            <>
              <article className="rounded-[24px] bg-accent-container/30 p-5">
                <header className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-accent px-3 py-1 text-sm font-bold text-on-accent">{latest.tag}</span>
                  <span className="type-label text-accent">{latest.prerelease ? 'Pré-version' : 'Dernière version'}</span>
                  <time
                    dateTime={latest.publishedAt}
                    title={formatDateTime(latest.publishedAt)}
                    className="ml-auto text-sm text-on-surface-variant"
                  >
                    {formatDate(latest.publishedAt)} · {relativeTime(latest.publishedAt)}
                  </time>
                </header>
                {latest.name && latest.name !== latest.tag && <h3 className="type-title mt-3">{latest.name}</h3>}
                <div className="mt-4">
                  <ReleaseBody release={latest} repo={repo} />
                </div>
              </article>

              {others.length > 0 && (
                <section className="mt-8" aria-labelledby={`${titleId}-history`}>
                  <h3 id={`${titleId}-history`} className="type-label flex items-center gap-2 text-on-surface-variant">
                    <Icon name="history" className="text-lg" />
                    Historique des versions
                  </h3>
                  <ul className="mt-3 flex flex-col gap-2">
                    {others.map((release) => (
                      <ReleaseAccordion key={release.id} release={release} repo={repo} initiallyOpen={release.tag === tag} />
                    ))}
                  </ul>
                </section>
              )}

              {repo.releaseCount > repo.releases.length && (
                <a
                  href={`${repo.htmlUrl}/releases`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="state-layer mt-6 flex h-12 items-center justify-center gap-2 rounded-full border border-accent-outline text-sm font-semibold text-accent"
                >
                  Voir les {repo.releaseCount} versions sur GitHub
                  <Icon name="arrow_outward" className="text-lg" />
                </a>
              )}
            </>
          ) : (
            <div className="grid place-items-center gap-3 py-16 text-center text-on-surface-variant">
              <Icon name="new_releases" className="text-4xl" />
              <p>Ce projet n’a pas encore publié de release.</p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

interface ChangelogSheetProps {
  repo: Repo | null;
  tag: string | null;
  onClose: () => void;
}

/** Panneau latéral (bureau) ou feuille du bas (mobile) avec l'historique des releases. */
export function ChangelogSheet({ repo, tag, onClose }: ChangelogSheetProps) {
  return (
    <AnimatePresence>{repo && <Sheet key={repo.fullName} repo={repo} tag={tag} onClose={onClose} />}</AnimatePresence>
  );
}
