import type { Release, Repo } from '../types';

// Recherche, filtres, tri et agrégats — logique pure, testée dans repos.test.ts.

export type SortKey = 'updated' | 'stars' | 'name';
export type ReleaseFilter = 'all' | 'with' | 'without';

export interface Filters {
  query: string;
  languages: string[];
  release: ReleaseFilter;
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = { query: '', languages: [], release: 'all', sort: 'updated' };

export const SORT_KEYS: readonly SortKey[] = ['updated', 'stars', 'name'];
export const RELEASE_FILTERS: readonly ReleaseFilter[] = ['all', 'with', 'without'];

/** Minuscules sans accents, pour une recherche tolérante. */
export function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() || 0 : 0);

/** Date de dernière activité : dernier commit de la branche par défaut, sinon dernier push. */
export function lastActivity(repo: Repo): string {
  return repo.lastCommit?.date ?? repo.pushedAt ?? repo.createdAt;
}

/** Même règle que le badge « Latest » de GitHub : la plus récente hors pré-versions. */
export function latestRelease(repo: Pick<Repo, 'releases'>): Release | null {
  return repo.releases.find((r) => !r.prerelease) ?? repo.releases[0] ?? null;
}

/** Pré-version publiée après la dernière version stable, s'il y en a une. */
export function newerPrerelease(repo: Pick<Repo, 'releases'>): Release | null {
  const latest = latestRelease(repo);
  const first = repo.releases[0];
  return first && latest && first !== latest && first.prerelease ? first : null;
}

export function matchesQuery(repo: Repo, query: string): boolean {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalize(
    [repo.name, repo.description ?? '', repo.language ?? '', ...repo.topics, ...repo.topics.map((t) => `#${t}`)].join(' '),
  );
  return terms.every((term) => haystack.includes(term));
}

const nameCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function compare(sort: SortKey) {
  const byUpdate = (a: Repo, b: Repo) => time(lastActivity(b)) - time(lastActivity(a));
  switch (sort) {
    case 'stars':
      return (a: Repo, b: Repo) => b.stars - a.stars || byUpdate(a, b);
    case 'name':
      return (a: Repo, b: Repo) => nameCollator.compare(a.name, b.name);
    default:
      return (a: Repo, b: Repo) => byUpdate(a, b) || nameCollator.compare(a.name, b.name);
  }
}

export function applyFilters(repos: readonly Repo[], filters: Filters): Repo[] {
  const languages = new Set(filters.languages);
  return repos
    .filter((repo) => {
      if (languages.size > 0 && !languages.has(repo.language ?? '')) return false;
      if (filters.release === 'with' && repo.releases.length === 0) return false;
      if (filters.release === 'without' && repo.releases.length > 0) return false;
      return matchesQuery(repo, filters.query);
    })
    .sort(compare(filters.sort));
}

export function isFiltered(filters: Filters): boolean {
  return filters.query.trim() !== '' || filters.languages.length > 0 || filters.release !== 'all';
}

export interface LanguageCount {
  name: string;
  count: number;
}

/** Langages principaux présents, les plus fréquents d'abord. */
export function languageCounts(repos: readonly Repo[]): LanguageCount[] {
  const counts = new Map<string, number>();
  for (const repo of repos) if (repo.language) counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || nameCollator.compare(a.name, b.name));
}

export interface ReleaseEntry {
  repo: Repo;
  release: Release;
}

/** Les `limit` releases les plus récentes, tous dépôts confondus. */
export function recentReleases(repos: readonly Repo[], limit: number): ReleaseEntry[] {
  return repos
    .flatMap((repo) => repo.releases.map((release) => ({ repo, release })))
    .sort((a, b) => time(b.release.publishedAt) - time(a.release.publishedAt))
    .slice(0, limit);
}

export interface GlobalStats {
  repoCount: number;
  totalStars: number;
  releaseCount: number;
  latest: ReleaseEntry | null;
}

export function globalStats(repos: readonly Repo[]): GlobalStats {
  return {
    repoCount: repos.length,
    totalStars: repos.reduce((sum, r) => sum + r.stars, 0),
    releaseCount: repos.reduce((sum, r) => sum + r.releaseCount, 0),
    latest: recentReleases(repos, 1)[0] ?? null,
  };
}

/** Répartition des langages en pourcentages (les petits regroupés dans « Autres »). */
export function languageShares(
  languages: Record<string, number>,
  maxSegments = 5,
  minShare = 0.02,
): Array<{ name: string; share: number }> {
  const total = Object.values(languages).reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const sorted = Object.entries(languages)
    .map(([name, bytes]) => ({ name, share: bytes / total }))
    .sort((a, b) => b.share - a.share);
  const kept = sorted.filter((l, i) => i < maxSegments && l.share >= minShare);
  const rest = 1 - kept.reduce((sum, l) => sum + l.share, 0);
  return rest > 0.0005 ? [...kept, { name: 'Autres', share: rest }] : kept;
}
