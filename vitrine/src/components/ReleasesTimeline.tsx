import { motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { accentKey } from '../lib/languages';
import { formatDateTime, relativeTime } from '../lib/format';
import { spring } from '../lib/motion';
import type { ReleaseEntry } from '../lib/repos';
import type { Release, Repo } from '../types';
import { IconButton } from './Buttons';
import { Icon } from './Icon';

interface ReleasesTimelineProps {
  entries: ReleaseEntry[];
  onOpenRelease: (repo: Repo, release: Release, trigger: HTMLElement) => void;
}

/** Rail horizontal des releases les plus récentes, tous dépôts confondus. */
export function ReleasesTimeline({ entries, onOpenRelease }: ReleasesTimelineProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, entries.length]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: reduced ? 'auto' : 'smooth' });
  };

  if (entries.length === 0) return null;

  return (
    <section aria-labelledby="timeline-title" className="mt-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="timeline-title" className="type-headline flex items-center gap-3">
            <Icon name="new_releases" filled className="text-primary" />
            Dernières releases
          </h2>
          <p className="mt-1 text-on-surface-variant">
            Les {entries.length} versions les plus récentes, tous projets confondus.
          </p>
        </div>
        <div className="hidden shrink-0 gap-1 md:flex">
          <IconButton label="Releases plus récentes" icon="chevron_left" disabled={edges.start} onClick={() => scrollByPage(-1)} />
          <IconButton label="Releases plus anciennes" icon="chevron_right" disabled={edges.end} onClick={() => scrollByPage(1)} />
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={measure}
        tabIndex={0}
        role="region"
        aria-label="Chronologie des releases (défilement horizontal)"
        className="rail -mx-4 mt-6 snap-x snap-mandatory overflow-x-auto overscroll-x-contain px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        <ol className="relative flex w-max gap-4 pt-10">
          <span aria-hidden="true" className="absolute top-[27px] right-0 left-0 h-0.5 rounded-full bg-outline-variant" />
          {entries.map(({ repo, release }, i) => (
            <motion.li
              key={`${repo.fullName}@${release.id}`}
              data-accent={accentKey(repo.language)}
              className="relative w-[16.5rem] shrink-0 snap-start scroll-ml-4 sm:scroll-ml-6 lg:scroll-ml-8"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ ...spring.spatial, delay: Math.min(i, 6) * 0.05 }}
            >
              <span
                aria-hidden="true"
                className="absolute -top-[19px] left-5 size-3.5 rounded-full bg-accent ring-4 ring-surface"
              />
              <time
                dateTime={release.publishedAt}
                title={formatDateTime(release.publishedAt)}
                className="absolute -top-[40px] left-4 text-xs font-medium whitespace-nowrap text-on-surface-variant"
              >
                {relativeTime(release.publishedAt)}
              </time>
              <button
                type="button"
                onClick={(e) => onOpenRelease(repo, release, e.currentTarget)}
                className="group state-layer flex h-full w-full flex-col gap-2 rounded-[24px] bg-accent-surface/90 p-4 text-left shadow-[var(--elevation-1)] backdrop-blur-md transition-shadow duration-300 hover:shadow-[var(--elevation-3)]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-bold text-accent [font-stretch:108%]">{repo.name}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-accent-container px-2.5 py-0.5 text-xs font-semibold text-on-accent-container">
                    {release.tag}
                  </span>
                </span>
                {release.name && release.name !== release.tag && (
                  <span className="truncate text-sm font-semibold">{release.name}</span>
                )}
                <span className="line-clamp-3 text-sm leading-relaxed text-on-surface-variant">
                  {release.summary || 'Pas de notes de version.'}
                </span>
                <span className="mt-auto flex items-center gap-1 pt-1 text-sm font-semibold text-accent">
                  Changelog
                  <Icon name="arrow_forward" className="text-base transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </button>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
