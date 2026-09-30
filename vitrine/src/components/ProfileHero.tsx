import { animate, motion, useInView, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { accentKey } from '../lib/languages';
import { spring } from '../lib/motion';
import type { GlobalStats } from '../lib/repos';
import { cachedShapePath, shapeClipPath, type ShapeName } from '../lib/shapes';
import { formatCompact, formatInteger, relativeTime } from '../lib/format';
import type { IconName } from '../lib/icons';
import type { Profile, Release, Repo } from '../types';
import { Icon } from './Icon';

const AVATAR_SHAPE: CSSProperties = {
  ['--shape-rest' as string]: shapeClipPath('cookie12'),
  ['--shape-hover' as string]: shapeClipPath('circle'),
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: spring.spatial },
};

function ShapeAvatar({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="group relative size-36 sm:size-44">
      <svg viewBox="0 0 100 100" aria-hidden="true" className="spin-slow absolute -inset-3 size-[calc(100%+1.5rem)] opacity-90">
        <defs>
          <linearGradient id="avatar-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--md-primary)' }} />
            <stop offset="0.55" style={{ stopColor: 'var(--md-tertiary)' }} />
            <stop offset="1" style={{ stopColor: 'var(--md-secondary)' }} />
          </linearGradient>
        </defs>
        <path d={cachedShapePath('cookie9')} fill="url(#avatar-ring)" />
      </svg>
      <img
        src={src}
        alt={alt}
        width={176}
        height={176}
        className="shape-avatar relative size-full bg-surface-container-high object-cover"
        style={AVATAR_SHAPE}
      />
    </div>
  );
}

/** Nombre qui défile jusqu'à sa valeur quand il entre dans l'écran. */
function CountUp({ value, compact = false }: { value: number; compact?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const format = compact ? formatCompact : formatInteger;

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    if (reduced || value === 0) {
      el.textContent = format(value);
      return;
    }
    const controls = animate(0, value, {
      duration: Math.min(1.6, 0.6 + value / 200),
      ease: [0.05, 0.7, 0.1, 1],
      onUpdate: (v) => (el.textContent = format(Math.round(v))),
    });
    return () => controls.stop();
  }, [inView, value, reduced, format]);

  return (
    <>
      <span ref={ref} aria-hidden="true" className="tabular-nums">
        {format(reduced ? value : 0)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

function ShapeIcon({ icon, shape, className = '' }: { icon: IconName; shape: ShapeName; className?: string }) {
  return (
    <span className={`relative grid size-12 shrink-0 place-items-center ${className}`} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        <path d={cachedShapePath(shape)} className="fill-current" />
      </svg>
      <Icon name={icon} filled className="relative text-[1.35rem] text-on-accent-container" />
    </span>
  );
}

function StatCard({ icon, shape, label, children }: { icon: IconName; shape: ShapeName; label: string; children: ReactNode }) {
  return (
    <motion.li
      variants={fadeUp}
      className="flex min-w-0 items-center gap-4 rounded-card bg-surface-container-low/80 p-4 shadow-[var(--elevation-1)] backdrop-blur-md sm:p-5"
    >
      <ShapeIcon icon={icon} shape={shape} className="text-accent-container" />
      <div className="min-w-0">
        <p className="type-label text-on-surface-variant">{label}</p>
        <div className="mt-0.5 truncate">{children}</div>
      </div>
    </motion.li>
  );
}

interface ProfileHeroProps {
  profile: Profile;
  stats: GlobalStats;
  onOpenRelease: (repo: Repo, release: Release, trigger: HTMLElement) => void;
}

export function ProfileHero({ profile, stats, onOpenRelease }: ProfileHeroProps) {
  const latest = stats.latest;
  const meta: Array<{ icon: IconName; text: string; href?: string }> = [];
  if (profile.location) meta.push({ icon: 'location_on', text: profile.location });
  if (profile.company) meta.push({ icon: 'business', text: profile.company });
  if (profile.blog) {
    const href = /^https?:\/\//i.test(profile.blog) ? profile.blog : `https://${profile.blog}`;
    meta.push({ icon: 'link', text: profile.blog.replace(/^https?:\/\//i, '').replace(/\/$/, ''), href });
  }
  if (profile.followers !== null) {
    meta.push({ icon: 'group', text: `${formatInteger(profile.followers)} abonné${profile.followers >= 2 ? 's' : ''}` });
  }

  return (
    <section id="top" aria-label="Profil" className="scroll-mt-24">
      <div className="grid items-center gap-8 pt-6 sm:pt-10 md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
        <motion.div
          className="justify-self-center md:justify-self-start"
          initial={{ opacity: 0, scale: 0.7, rotate: -25 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={spring.slowSpatial}
        >
          <ShapeAvatar src={profile.avatarUrl} alt={`Avatar de ${profile.name ?? profile.login}`} />
        </motion.div>

        <motion.div
          className="min-w-0 text-center md:text-left"
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
        >
          <motion.p variants={fadeUp} className="type-label tracking-[0.14em] text-primary uppercase">
            Projets open source
          </motion.p>
          <motion.h1 variants={fadeUp} className="type-display mt-2 text-balance">
            {profile.name ?? profile.login}
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-2 text-on-surface-variant">
            <a
              href={profile.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline-offset-4 hover:text-on-surface hover:underline"
            >
              @{profile.login}
            </a>
          </motion.p>
          {profile.bio && (
            <motion.p
              variants={fadeUp}
              className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-pretty text-on-surface-variant md:mx-0"
            >
              {profile.bio}
            </motion.p>
          )}
          {meta.length > 0 && (
            <motion.ul variants={fadeUp} className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
              {meta.map((m) => (
                <li key={m.icon}>
                  {m.href ? (
                    <a
                      href={m.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="state-layer inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-container-high/80 px-3 text-sm"
                    >
                      <Icon name={m.icon} className="text-base text-primary" />
                      {m.text}
                    </a>
                  ) : (
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-container-high/80 px-3 text-sm">
                      <Icon name={m.icon} className="text-base text-primary" />
                      {m.text}
                    </span>
                  )}
                </li>
              ))}
            </motion.ul>
          )}
        </motion.div>
      </div>

      <motion.ul
        aria-label="Statistiques"
        className="mt-10 grid gap-3 sm:grid-cols-3 sm:gap-4"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.35 } } }}
      >
        <StatCard icon="inventory_2" shape="cookie6" label="Dépôts publics">
          <span className="type-headline">
            <CountUp value={stats.repoCount} />
          </span>
        </StatCard>
        <StatCard icon="star" shape="sunny" label="Étoiles au total">
          <span className="type-headline">
            <CountUp value={stats.totalStars} compact />
          </span>
        </StatCard>
        <StatCard icon="rocket_launch" shape="clover4" label="Dernière release publiée">
          {latest ? (
            <button
              type="button"
              data-accent={accentKey(latest.repo.language)}
              onClick={(e) => onOpenRelease(latest.repo, latest.release, e.currentTarget)}
              className="group flex max-w-full min-w-0 flex-col items-start text-left"
              title={`Voir le changelog de ${latest.repo.name}`}
            >
              <span className="max-w-full truncate text-lg leading-tight font-bold group-hover:underline">
                {latest.repo.name}
              </span>
              <span className="mt-1 flex max-w-full items-center gap-2">
                <span className="truncate rounded-full bg-accent-container px-2 py-0.5 text-xs font-semibold text-on-accent-container">
                  {latest.release.tag}
                </span>
                <span className="shrink-0 text-sm text-on-surface-variant">{relativeTime(latest.release.publishedAt)}</span>
              </span>
            </button>
          ) : (
            <span className="text-lg font-semibold text-on-surface-variant">Aucune pour l’instant</span>
          )}
        </StatCard>
      </motion.ul>
    </section>
  );
}
