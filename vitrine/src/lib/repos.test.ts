import { describe, expect, it } from 'vitest';
import type { Release, Repo } from '../types';
import {
  DEFAULT_FILTERS,
  applyFilters,
  globalStats,
  isFiltered,
  languageCounts,
  languageShares,
  latestRelease,
  newerPrerelease,
  recentReleases,
} from './repos';

const release = (tag: string, publishedAt: string, prerelease = false): Release => ({
  id: tag.length + publishedAt.length,
  tag,
  name: tag,
  publishedAt,
  url: `https://github.com/x/releases/tag/${tag}`,
  body: '',
  summary: '',
  prerelease,
  assets: [],
  zipballUrl: null,
  tarballUrl: null,
});

const repo = (name: string, over: Partial<Repo> = {}): Repo => ({
  name,
  fullName: `Karelisio/${name}`,
  description: null,
  htmlUrl: `https://github.com/Karelisio/${name}`,
  homepage: null,
  language: null,
  languages: {},
  topics: [],
  stars: 0,
  forks: 0,
  openIssues: 0,
  openPulls: 0,
  hasIssues: true,
  license: null,
  fork: false,
  archived: false,
  defaultBranch: 'main',
  createdAt: '2025-01-01T00:00:00Z',
  pushedAt: '2025-01-01T00:00:00Z',
  lastCommit: null,
  releaseCount: over.releases?.length ?? 0,
  releases: [],
  ...over,
});

const commit = (date: string) => ({ sha: 'x', message: 'm', date, url: 'u', author: null });

const REPOS = [
  repo('Mago', {
    language: 'TypeScript',
    description: 'Listes partagées pour un couple',
    topics: ['android', 'capacitor'],
    stars: 3,
    lastCommit: commit('2026-09-30T07:00:00Z'),
    releases: [release('v2', '2026-09-29T00:00:00Z'), release('v1', '2026-08-01T00:00:00Z')],
  }),
  repo('Orbit', { language: 'Kotlin', stars: 10, lastCommit: commit('2026-09-10T00:00:00Z') }),
  repo('Casse-brique', {
    language: 'TypeScript',
    description: 'Jeu de casse-briques rétro',
    stars: 3,
    pushedAt: '2026-09-25T00:00:00Z',
    releases: [release('v0.2', '2026-09-20T00:00:00Z')],
  }),
  repo('Élan', { language: null, pushedAt: '2024-05-01T00:00:00Z' }),
];

const names = (list: Repo[]) => list.map((r) => r.name);

describe('applyFilters', () => {
  it('trie par dernière activité par défaut', () => {
    expect(names(applyFilters(REPOS, DEFAULT_FILTERS))).toEqual(['Mago', 'Casse-brique', 'Orbit', 'Élan']);
  });

  it('trie par étoiles puis activité, ou par nom', () => {
    expect(names(applyFilters(REPOS, { ...DEFAULT_FILTERS, sort: 'stars' }))).toEqual(['Orbit', 'Mago', 'Casse-brique', 'Élan']);
    expect(names(applyFilters(REPOS, { ...DEFAULT_FILTERS, sort: 'name' }))).toEqual(['Casse-brique', 'Élan', 'Mago', 'Orbit']);
  });

  it('cherche sans tenir compte des accents ni de la casse, tous les mots requis', () => {
    expect(names(applyFilters(REPOS, { ...DEFAULT_FILTERS, query: 'elan' }))).toEqual(['Élan']);
    expect(names(applyFilters(REPOS, { ...DEFAULT_FILTERS, query: 'PARTAGEES couple' }))).toEqual(['Mago']);
    expect(names(applyFilters(REPOS, { ...DEFAULT_FILTERS, query: '#android' }))).toEqual(['Mago']);
    expect(names(applyFilters(REPOS, { ...DEFAULT_FILTERS, query: 'kotlin' }))).toEqual(['Orbit']);
  });

  it('filtre par langages (OU) et par présence de release', () => {
    expect(names(applyFilters(REPOS, { ...DEFAULT_FILTERS, languages: ['Kotlin', 'TypeScript'], sort: 'name' }))).toEqual([
      'Casse-brique',
      'Mago',
      'Orbit',
    ]);
    expect(names(applyFilters(REPOS, { ...DEFAULT_FILTERS, release: 'with' }))).toEqual(['Mago', 'Casse-brique']);
    expect(names(applyFilters(REPOS, { ...DEFAULT_FILTERS, release: 'without' }))).toEqual(['Orbit', 'Élan']);
  });

  it('isFiltered ignore le tri', () => {
    expect(isFiltered({ ...DEFAULT_FILTERS, sort: 'stars' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, query: ' ' })).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, release: 'with' })).toBe(true);
  });
});

describe('releases', () => {
  it('latestRelease saute les pré-versions, sauf s’il n’y a qu’elles', () => {
    const r = repo('X', { releases: [release('v2-beta', '2026-09-02T00:00:00Z', true), release('v1', '2026-09-01T00:00:00Z')] });
    expect(latestRelease(r)?.tag).toBe('v1');
    expect(newerPrerelease(r)?.tag).toBe('v2-beta');
    const onlyBeta = repo('Y', { releases: [release('v0-beta', '2026-01-01T00:00:00Z', true)] });
    expect(latestRelease(onlyBeta)?.tag).toBe('v0-beta');
    expect(newerPrerelease(onlyBeta)).toBeNull();
    expect(latestRelease(repo('Z'))).toBeNull();
  });

  it('recentReleases mélange les dépôts par date', () => {
    expect(recentReleases(REPOS, 2).map((e) => `${e.repo.name}@${e.release.tag}`)).toEqual(['Mago@v2', 'Casse-brique@v0.2']);
  });

  it('globalStats agrège étoiles, dépôts et dernière release', () => {
    const stats = globalStats(REPOS);
    expect(stats).toMatchObject({ repoCount: 4, totalStars: 16, releaseCount: 3 });
    expect(stats.latest?.release.tag).toBe('v2');
    expect(globalStats([]).latest).toBeNull();
  });
});

describe('langages', () => {
  it('compte les langages principaux', () => {
    expect(languageCounts(REPOS)).toEqual([
      { name: 'TypeScript', count: 2 },
      { name: 'Kotlin', count: 1 },
    ]);
  });

  it('regroupe les petites parts dans « Autres »', () => {
    const shares = languageShares({ TypeScript: 900, CSS: 80, HTML: 15, Shell: 5 });
    expect(shares.map((s) => s.name)).toEqual(['TypeScript', 'CSS', 'Autres']);
    expect(shares.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
    expect(languageShares({})).toEqual([]);
  });
});
