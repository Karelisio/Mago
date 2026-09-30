import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { memo, type PointerEvent, type ReactNode } from 'react';
import { useFinePointer } from '../hooks/useMediaQuery';
import { assetKind, sortAssets } from '../lib/assets';
import { formatCompact, formatDateTime, plural, relativeTime } from '../lib/format';
import { accentKey, languageColor } from '../lib/languages';
import { spring } from '../lib/motion';
import { lastActivity, latestRelease, newerPrerelease } from '../lib/repos';
import type { Repo } from '../types';
import { AssetButton } from './AssetButton';
import { LinkChip } from './Buttons';
import { ShapeMonogram } from './ExpressiveShape';
import { Icon } from './Icon';
import { LanguageBar } from './LanguageBar';

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-tertiary-container px-2.5 text-xs font-semibold text-on-tertiary-container">
      {children}
    </span>
  );
}

function ReleaseBlock({ repo, onOpen }: { repo: Repo; onOpen: (trigger: HTMLElement) => void }) {
  const latest = latestRelease(repo);
  if (!latest) {
    return (
      <div className="flex items-center gap-2 rounded-[22px] border border-dashed border-accent-outline px-4 py-3 text-sm text-on-surface-variant">
        <Icon name="new_releases" className="text-lg" />
        Pas encore de release
      </div>
    );
  }
  const downloads = sortAssets(latest.assets).filter((a) => assetKind(a.name) !== 'checksum');
  const shown = downloads.slice(0, 2);
  const newer = newerPrerelease(repo);

  return (
    <section aria-label={`Dernière release : ${latest.tag}`} className="rounded-[22px] bg-accent-container/30 p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Icon name="new_releases" filled className="text-lg text-accent" />
        <span className="font-bold break-all">{latest.tag}</span>
        {latest.prerelease && <Badge>Pré-version</Badge>}
        <time
          dateTime={latest.publishedAt}
          title={formatDateTime(latest.publishedAt)}
          className="ml-auto text-sm text-on-surface-variant"
        >
          {relativeTime(latest.publishedAt)}
        </time>
      </div>
      {latest.name && latest.name !== latest.tag && <p className="mt-1 truncate text-sm font-medium">{latest.name}</p>}
      {newer && (
        <p className="mt-1 text-xs text-on-surface-variant">
          Pré-version plus récente : <span className="font-semibold">{newer.tag}</span>
        </p>
      )}
      {shown.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {shown.map((asset, i) => (
            <AssetButton key={asset.url} asset={asset} variant={i === 0 ? 'filled' : 'tonal'} />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={(e) => onOpen(e.currentTarget)}
        className="group/cl state-layer -mx-2 mt-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-full px-2 py-2 text-left text-sm font-semibold text-accent"
      >
        <Icon name="history" className="text-lg" />
        <span className="min-w-0 truncate">
          Changelog · {plural(repo.releaseCount, 'version')}
          {downloads.length > shown.length && ` · +${plural(downloads.length - shown.length, 'fichier')}`}
        </span>
        <Icon name="arrow_forward" className="ml-auto text-lg transition-transform duration-300 group-hover/cl:translate-x-1" />
      </button>
    </section>
  );
}

interface RepoCardProps {
  repo: Repo;
  onOpenChangelog: (repo: Repo, trigger: HTMLElement) => void;
}

export const RepoCard = memo(function RepoCard({ repo, onOpenChangelog }: RepoCardProps) {
  const reduced = useReducedMotion();
  const finePointer = useFinePointer();
  const tilt = finePointer && !reduced;

  // Tilt 3D léger + reflet qui suit le pointeur (souris uniquement).
  const rotateX = useSpring(0, { stiffness: 250, damping: 24 });
  const rotateY = useSpring(0, { stiffness: 250, damping: 24 });
  const glowX = useMotionValue(50);
  const glowY = useMotionValue(0);
  const glow = useMotionTemplate`radial-gradient(28rem circle at ${glowX}% ${glowY}%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 70%)`;

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    if (!tilt || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    rotateX.set((0.5 - py) * 6);
    rotateY.set((px - 0.5) * 6);
    glowX.set(px * 100);
    glowY.set(py * 100);
  };
  const onPointerLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  const activity = lastActivity(repo);
  const topics = repo.topics.slice(0, 6);

  return (
    <motion.article
      data-accent={accentKey(repo.language)}
      aria-labelledby={`repo-${repo.name}`}
      className="group relative flex h-full flex-col gap-4 rounded-card border border-accent-outline/60 bg-accent-surface/95 p-5 shadow-[var(--elevation-1)] transition-shadow duration-300 ease-emphasized hover:shadow-[var(--elevation-4)] sm:p-6"
      style={tilt ? { rotateX, rotateY, transformPerspective: 1100 } : undefined}
      initial="rest"
      animate="rest"
      whileHover="hover"
      variants={{ rest: { y: 0 }, hover: { y: tilt ? -6 : 0 } }}
      transition={spring.spatial}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {tilt && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{ background: glow }}
        />
      )}

      <header className="relative flex items-start gap-4">
        <ShapeMonogram name={repo.name} />
        <div className="min-w-0 flex-1">
          <h3 id={`repo-${repo.name}`} className="type-title break-words">
            <a
              href={repo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="decoration-accent decoration-2 underline-offset-4 hover:underline"
            >
              {repo.name}
            </a>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-on-surface-variant">
            {repo.language && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full ring-1 ring-outline-variant"
                  style={{ background: languageColor(repo.language) }}
                />
                {repo.language}
              </span>
            )}
            {repo.license && (
              <span className="inline-flex items-center gap-1" title="Licence">
                <Icon name="balance" className="text-base" />
                {repo.license}
              </span>
            )}
            {repo.forks > 0 && (
              <span className="inline-flex items-center gap-1" title="Forks">
                <Icon name="call_split" className="text-base" />
                {formatCompact(repo.forks)}
              </span>
            )}
            {repo.fork && <Badge>Fork</Badge>}
            {repo.archived && <Badge>Archivé</Badge>}
          </div>
        </div>
        <a
          href={`${repo.htmlUrl}/stargazers`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={plural(repo.stars, 'étoile')}
          title={plural(repo.stars, 'étoile')}
          className="group/star state-layer inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-accent-soft px-3 text-sm font-semibold text-on-accent-soft"
        >
          <Icon name="star" className="text-[1.1rem] transition-transform duration-300 group-hover/star:rotate-[72deg]" fillOnHover />
          {formatCompact(repo.stars)}
        </a>
      </header>

      {repo.description ? (
        <p className="relative line-clamp-3 leading-relaxed text-on-surface-variant">{repo.description}</p>
      ) : (
        <p className="relative text-on-surface-variant/70 italic">Pas de description.</p>
      )}

      {topics.length > 0 && (
        <ul className="relative flex flex-wrap gap-1.5" aria-label="Topics">
          {topics.map((topic) => (
            <li key={topic} className="rounded-full bg-accent-soft/70 px-2.5 py-1 text-xs font-medium text-on-accent-soft">
              #{topic}
            </li>
          ))}
          {repo.topics.length > topics.length && (
            <li className="px-1 py-1 text-xs text-on-surface-variant">+{repo.topics.length - topics.length}</li>
          )}
        </ul>
      )}

      <div className="relative">
        <LanguageBar languages={repo.languages} />
      </div>

      <div className="relative mt-auto flex flex-col gap-4">
        <p className="flex min-w-0 items-center gap-2 text-sm text-on-surface-variant">
          <Icon name="schedule" className="text-base" />
          <span className="shrink-0">
            {repo.lastCommit ? 'Dernier commit' : 'Dernier push'}{' '}
            <time dateTime={activity} title={formatDateTime(activity)} className="font-semibold text-on-surface">
              {relativeTime(activity)}
            </time>
          </span>
          {repo.lastCommit && (
            <a
              href={repo.lastCommit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate hover:text-on-surface hover:underline"
              title={repo.lastCommit.message}
            >
              · {repo.lastCommit.message}
            </a>
          )}
        </p>

        <ReleaseBlock repo={repo} onOpen={(trigger) => onOpenChangelog(repo, trigger)} />

        <footer className="flex flex-wrap gap-2">
          <LinkChip href={repo.htmlUrl} icon="code">
            Code
          </LinkChip>
          {repo.hasIssues && (
            <LinkChip href={`${repo.htmlUrl}/issues`} icon="adjust">
              Issues
              {repo.openIssues > 0 && (
                <span className="rounded-full bg-accent-container px-1.5 text-xs font-semibold text-on-accent-container">
                  {repo.openIssues}
                </span>
              )}
            </LinkChip>
          )}
          <LinkChip href={`${repo.htmlUrl}/releases`} icon="sell">
            Releases
          </LinkChip>
          {repo.homepage && (
            <LinkChip href={repo.homepage} icon="language">
              Site
            </LinkChip>
          )}
        </footer>
      </div>
    </motion.article>
  );
});
