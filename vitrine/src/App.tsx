import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AnimatedBackground } from './components/AnimatedBackground';
import { ChangelogSheet } from './components/ChangelogSheet';
import { Footer } from './components/Footer';
import { Icon } from './components/Icon';
import { ProfileHero } from './components/ProfileHero';
import { ReleasesTimeline } from './components/ReleasesTimeline';
import { RepoGrid } from './components/RepoGrid';
import { EmptyState, ErrorState, LoadingState } from './components/States';
import { Toolbar } from './components/Toolbar';
import { TopBar } from './components/TopBar';
import { CONFIG } from './config';
import { useData } from './hooks/useData';
import { useUrlState } from './hooks/useUrlState';
import { accentKey, languageColor } from './lib/languages';
import {
  DEFAULT_FILTERS,
  applyFilters,
  globalStats,
  isFiltered,
  languageCounts,
  recentReleases,
  type Filters,
} from './lib/repos';
import { accentCss } from './lib/theme';
import type { Release, Repo } from './types';

const NO_REPOS: Repo[] = [];

export default function App() {
  const data = useData();
  const { state: url, update, openSheet, closeSheet } = useUrlState();
  const ready = data.status === 'ready';
  const repos = ready ? data.data.repos : NO_REPOS;
  const profile = ready ? data.data.profile : null;

  const { query, languages, release, sort } = url;
  const filters = useMemo<Filters>(() => ({ query, languages, release, sort }), [query, languages, release, sort]);
  const visible = useMemo(() => applyFilters(repos, filters), [repos, filters]);
  const languageList = useMemo(() => languageCounts(repos), [repos]);
  const stats = useMemo(() => globalStats(repos), [repos]);
  const timeline = useMemo(() => recentReleases(repos, CONFIG.timelineSize), [repos]);

  // Une palette M3 par langage présent (clair + sombre), appliquée via [data-accent].
  const accentStyles = useMemo(() => {
    const langs = [...new Set(repos.map((r) => r.language).filter((l): l is string => !!l))];
    return accentCss(
      langs.map((l) => ({ key: accentKey(l), color: languageColor(l) })),
      CONFIG.paletteStyle,
    );
  }, [repos]);

  const sheetRepo = url.repo ? (repos.find((r) => r.name === url.repo) ?? null) : null;

  // Lien vers un dépôt disparu (renommé, archivé…) : on nettoie l'URL.
  useEffect(() => {
    if (ready && url.repo && !sheetRepo) update({ repo: null, tag: null });
  }, [ready, url.repo, sheetRepo, update]);

  // Focus rendu à l'élément déclencheur à la fermeture du changelog.
  const trigger = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (sheetRepo) {
      wasOpen.current = true;
      document.title = `${sheetRepo.name} — changelog · ${CONFIG.title}`;
    } else if (wasOpen.current) {
      wasOpen.current = false;
      document.title = CONFIG.title;
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    }
  }, [sheetRepo]);

  const openChangelog = useCallback(
    (repo: Repo, from: HTMLElement) => {
      trigger.current = from;
      openSheet(repo.name);
    },
    [openSheet],
  );

  const openRelease = useCallback(
    (repo: Repo, rel: Release, from: HTMLElement) => {
      trigger.current = from;
      openSheet(repo.name, rel.tag);
    },
    [openSheet],
  );

  const resetFilters = useCallback(() => update({ ...DEFAULT_FILTERS, sort }), [update, sort]);

  return (
    <>
      <AnimatedBackground />
      {accentStyles && <style>{accentStyles}</style>}

      <div inert={sheetRepo !== null} className="flex min-h-dvh flex-col">
        <a
          href="#projets"
          className="sr-only z-50 rounded-full bg-primary px-4 py-2 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Aller aux projets
        </a>
        <TopBar profile={profile} />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 sm:px-6 lg:px-8">
          {data.status === 'loading' && <LoadingState />}
          {data.status === 'error' && <ErrorState message={data.error} onRetry={data.retry} />}
          {ready && profile && (
            <>
              {data.data.demo && (
                <div
                  role="note"
                  className="mt-4 flex items-start gap-3 rounded-[20px] bg-tertiary-container px-4 py-3 text-sm text-on-tertiary-container"
                >
                  <Icon name="auto_awesome" className="mt-0.5 text-lg" />
                  <p>
                    <strong>Données de démonstration</strong> (projets fictifs).{' '}
                    <code className="font-mono">npm run fetch-data</code> ou le workflow GitHub Pages les remplace par
                    tes vrais dépôts.
                  </p>
                </div>
              )}
              <ProfileHero profile={profile} stats={stats} onOpenRelease={openRelease} />
              <ReleasesTimeline entries={timeline} onOpenRelease={openRelease} />

              <section id="projets" aria-labelledby="projects-title" className="mt-16 scroll-mt-20">
                <h2 id="projects-title" className="type-headline flex items-center gap-3">
                  <Icon name="code" className="text-primary" />
                  Projets
                </h2>
                {repos.length === 0 ? (
                  <div className="mt-6">
                    <EmptyState
                      title="Aucun dépôt public à afficher"
                      message="Vérifie le nom d’utilisateur et les exclusions (forks, archivés) dans config.json, puis régénère data.json."
                    />
                  </div>
                ) : (
                  <>
                    <div className="mt-6">
                      <Toolbar
                        filters={filters}
                        languages={languageList}
                        resultCount={visible.length}
                        totalCount={repos.length}
                        filtered={isFiltered(filters)}
                        onChange={update}
                        onReset={resetFilters}
                      />
                    </div>
                    <div className="mt-6">
                      {visible.length > 0 ? (
                        <RepoGrid repos={visible} onOpenChangelog={openChangelog} />
                      ) : (
                        <EmptyState
                          title="Aucun projet ne correspond"
                          message="Essaie un autre mot-clé ou retire un filtre."
                          actionLabel="Réinitialiser les filtres"
                          onAction={resetFilters}
                        />
                      )}
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </main>

        <Footer
          generatedAt={ready ? data.data.generatedAt : null}
          source={ready ? data.data.source : null}
          demo={ready && !!data.data.demo}
        />
      </div>

      <ChangelogSheet repo={sheetRepo} tag={url.tag} onClose={closeSheet} />
    </>
  );
}
