import { describe, expect, it } from 'vitest';
import {
  countFromLink,
  licenseLabel,
  mapLimit,
  nextLink,
  normalizeConfig,
  parseArgs,
  prepareReleases,
  retryDelayMs,
  safeUrl,
  selectRepos,
  summarize,
  toCommit,
  toProfile,
  toRepo,
} from './transform.mjs';

const repo = (over = {}) => ({
  name: 'Mago',
  full_name: 'Karelisio/Mago',
  private: false,
  fork: false,
  archived: false,
  disabled: false,
  ...over,
});

const rawRelease = (over = {}) => ({
  id: 1,
  tag_name: 'v1.0.0',
  name: 'v1.0.0',
  draft: false,
  prerelease: false,
  published_at: '2026-09-01T10:00:00Z',
  created_at: '2026-09-01T09:00:00Z',
  html_url: 'https://github.com/Karelisio/Mago/releases/tag/v1.0.0',
  body: 'Notes',
  assets: [],
  ...over,
});

describe('normalizeConfig', () => {
  it('applique les valeurs par défaut', () => {
    expect(normalizeConfig({ username: 'Karelisio' })).toEqual({
      username: 'Karelisio',
      excludeForks: true,
      excludeArchived: true,
      excludeRepos: [],
      maxReleasesPerRepo: 15,
    });
  });

  it('valide et normalise', () => {
    const c = normalizeConfig({
      username: ' Karelisio ',
      excludeForks: false,
      excludeRepos: ['Orbit', '', 3],
      maxReleasesPerRepo: 500,
    });
    expect(c.username).toBe('Karelisio');
    expect(c.excludeForks).toBe(false);
    expect(c.excludeRepos).toEqual(['orbit']);
    expect(c.maxReleasesPerRepo).toBe(100);
  });

  it('refuse un nom d’utilisateur invalide', () => {
    expect(() => normalizeConfig({ username: '../etc' })).toThrow(/username/);
    expect(() => normalizeConfig({})).toThrow(/username/);
  });
});

describe('parseArgs', () => {
  it('lit --repos et --out, avec ou sans « = »', () => {
    expect(parseArgs(['--repos', 'Mago,Karelisio/Orbit', '--out=tmp/data.json'])).toEqual({
      repos: ['Mago', 'Karelisio/Orbit'],
      out: 'tmp/data.json',
      help: false,
    });
    expect(parseArgs(['--repos=a.b-c']).repos).toEqual(['a.b-c']);
  });

  it('rejette les options inconnues, valeurs manquantes et noms suspects', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/inconnue/);
    expect(() => parseArgs(['--out'])).toThrow(/manquante/);
    expect(() => parseArgs(['--repos', '../x/y'])).toThrow(/invalide/);
  });
});

describe('selectRepos', () => {
  const list = [
    repo({ name: 'Mago' }),
    repo({ name: 'Fork', fork: true }),
    repo({ name: 'Vieux', archived: true }),
    repo({ name: 'Secret', private: true }),
    repo({ name: 'Orbit', full_name: 'Karelisio/Orbit' }),
  ];

  it('ignore forks, archivés, privés et exclusions', () => {
    const config = normalizeConfig({ username: 'Karelisio', excludeRepos: ['orbit'] });
    expect(selectRepos(list, config).map((r) => r.name)).toEqual(['Mago']);
  });

  it('garde forks et archivés si la config le demande', () => {
    const config = normalizeConfig({ username: 'Karelisio', excludeForks: false, excludeArchived: false });
    expect(selectRepos(list, config).map((r) => r.name)).toEqual(['Mago', 'Fork', 'Vieux', 'Orbit']);
  });
});

describe('prepareReleases', () => {
  const url = 'https://github.com/Karelisio/Mago';

  it('exclut les brouillons, trie par date et compte tout', () => {
    const { count, releases } = prepareReleases(
      [
        rawRelease({ id: 1, tag_name: 'v1', published_at: '2026-01-01T00:00:00Z' }),
        rawRelease({ id: 2, tag_name: 'v3', published_at: '2026-03-01T00:00:00Z' }),
        rawRelease({ id: 3, tag_name: 'brouillon', draft: true, published_at: null }),
        rawRelease({ id: 4, tag_name: 'v2', published_at: '2026-02-01T00:00:00Z' }),
      ],
      url,
      2,
    );
    expect(count).toBe(3);
    expect(releases.map((r) => r.tag)).toEqual(['v3', 'v2']);
  });

  it('construit les liens d’archives et les assets', () => {
    const [r] = prepareReleases(
      [
        rawRelease({
          tag_name: 'release/2.0',
          name: '  ',
          assets: [
            {
              name: 'app.apk',
              size: 5_200_000,
              download_count: 12,
              browser_download_url: 'https://github.com/x/app.apk',
              content_type: 'application/vnd.android.package-archive',
              state: 'uploaded',
            },
            { name: 'partiel.zip', size: 1, state: 'starter', browser_download_url: 'https://github.com/x/p.zip' },
          ],
        }),
      ],
      url,
      15,
    ).releases;
    expect(r.name).toBeNull();
    expect(r.zipballUrl).toBe(`${url}/archive/refs/tags/release/2.0.zip`);
    expect(r.tarballUrl).toBe(`${url}/archive/refs/tags/release/2.0.tar.gz`);
    expect(r.assets).toEqual([
      {
        name: 'app.apk',
        size: 5_200_000,
        downloads: 12,
        url: 'https://github.com/x/app.apk',
        contentType: 'application/vnd.android.package-archive',
      },
    ]);
  });
});

describe('summarize', () => {
  it('résume des notes générées par GitHub', () => {
    const body = [
      "## What's Changed",
      '* Widget : snapshot allégé by @Karelisio in https://github.com/Karelisio/Mago/pull/30',
      '* **Base** : colonnes figées by @Karelisio in https://github.com/Karelisio/Mago/pull/31',
      '',
      '**Full Changelog**: https://github.com/Karelisio/Mago/compare/v1...v2',
    ].join('\r\n');
    expect(summarize(body)).toBe('Widget : snapshot allégé (#30) · Base : colonnes figées (#31)');
  });

  it('retire images, liens, HTML, code et commentaires', () => {
    const body = '<!-- caché -->\n![capture](x.png)\nVoir [la doc](https://x.dev) et `npm test`.\n```js\ncode();\n```\n<details>Détails</details>';
    expect(summarize(body)).toBe('Voir la doc et npm test. · Détails');
  });

  it('tronque proprement sur un mot', () => {
    const out = summarize('mot '.repeat(100), 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('mot…')).toBe(true);
  });

  it('renvoie une chaîne vide sans notes', () => {
    expect(summarize('')).toBe('');
    expect(summarize(null)).toBe('');
  });
});

describe('toRepo / toCommit / toProfile', () => {
  it('sépare issues et pull requests, assainit la homepage', () => {
    const r = toRepo(
      repo({
        html_url: 'https://github.com/Karelisio/Mago',
        homepage: 'javascript:alert(1)',
        open_issues_count: 5,
        stargazers_count: 3,
        topics: ['android'],
        license: { spdx_id: 'MIT', name: 'MIT License' },
        default_branch: 'main',
        has_issues: true,
      }),
      { releases: [], releaseCount: 0, lastCommit: null, languages: { Kotlin: 10 }, openPulls: 2 },
    );
    expect(r.openIssues).toBe(3);
    expect(r.openPulls).toBe(2);
    expect(r.homepage).toBeNull();
    expect(r.license).toBe('MIT');
    expect(r.languages).toEqual({ Kotlin: 10 });
  });

  it('safeUrl ajoute https et refuse les autres schémas', () => {
    expect(safeUrl('karelisio.dev')).toBe('https://karelisio.dev/');
    expect(safeUrl('http://x.fr/a')).toBe('http://x.fr/a');
    expect(safeUrl('data:text/html,x')).toBeNull();
    expect(safeUrl('  ')).toBeNull();
  });

  it('licenseLabel gère les licences non reconnues', () => {
    expect(licenseLabel(null)).toBeNull();
    expect(licenseLabel({ spdx_id: 'NOASSERTION', name: 'Other' })).toBe('Autre');
  });

  it('toCommit garde la première ligne du message', () => {
    const c = toCommit({
      sha: 'abc',
      html_url: 'https://github.com/x/commit/abc',
      author: null,
      commit: { message: 'feat: truc\n\ndétails', author: { name: 'Karel', date: '2026-01-01T00:00:00Z' } },
    });
    expect(c).toEqual({ sha: 'abc', message: 'feat: truc', date: '2026-01-01T00:00:00Z', url: 'https://github.com/x/commit/abc', author: 'Karel' });
    expect(toCommit(undefined)).toBeNull();
  });

  it('toProfile se replie sur le propriétaire des dépôts', () => {
    const p = toProfile(null, { login: 'Karelisio', avatar_url: 'https://a/1', html_url: 'https://github.com/Karelisio' }, 'Karelisio');
    expect(p).toMatchObject({ login: 'Karelisio', avatarUrl: 'https://a/1', name: null, bio: null, followers: null });
  });
});

describe('pagination et nouvelles tentatives', () => {
  const link =
    '<https://api.github.com/repositories/1/pulls?state=open&per_page=1&page=2>; rel="next", ' +
    '<https://api.github.com/repositories/1/pulls?state=open&per_page=1&page=7>; rel="last"';

  it('lit les en-têtes Link', () => {
    expect(nextLink(link)).toContain('page=2');
    expect(nextLink(null)).toBeNull();
    expect(countFromLink(link, 1)).toBe(7);
    expect(countFromLink(null, 0)).toBe(0);
  });

  it('calcule le délai avant un nouvel essai', () => {
    const headers = (h) => (name) => h[name] ?? null;
    const now = 1_000_000_000_000;
    expect(retryDelayMs(403, headers({ 'retry-after': '30' }), 0, now)).toBe(30_000);
    expect(retryDelayMs(403, headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 20) }), 0, now)).toBe(21_000);
    expect(retryDelayMs(403, headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 + 3600) }), 0, now)).toBeNull();
    expect(retryDelayMs(502, headers({}), 1, now)).toBe(2000);
    expect(retryDelayMs(404, headers({}), 0, now)).toBeNull();
    expect(retryDelayMs(500, headers({}), 3, now)).toBeNull();
  });

  it('mapLimit borne la concurrence et garde l’ordre', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([30, 10, 20, 5, 15], 2, async (ms, i) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });
});
