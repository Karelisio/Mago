// Test de bout en bout du script : il tourne contre un faux serveur d'API
// local (GITHUB_API_URL), sans jamais contacter GitHub.
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);

const repo = (name, over = {}) => ({
  name,
  full_name: `Karelisio/${name}`,
  html_url: `https://github.com/Karelisio/${name}`,
  private: false,
  fork: false,
  archived: false,
  description: `Dépôt ${name}`,
  homepage: '',
  language: 'TypeScript',
  topics: ['demo'],
  stargazers_count: 2,
  forks_count: 0,
  open_issues_count: 5,
  has_issues: true,
  license: { spdx_id: 'MIT', name: 'MIT License' },
  default_branch: 'main',
  created_at: '2025-01-01T00:00:00Z',
  pushed_at: '2026-09-01T00:00:00Z',
  owner: { login: 'Karelisio', avatar_url: 'https://avatars.example/k', html_url: 'https://github.com/Karelisio' },
  ...over,
});

const release = (id, tag, date, over = {}) => ({
  id,
  tag_name: tag,
  name: tag,
  draft: false,
  prerelease: false,
  published_at: date,
  created_at: date,
  html_url: `https://github.com/Karelisio/Alpha/releases/tag/${tag}`,
  body: `* Changement ${tag}`,
  assets: [],
  ...over,
});

let server;
let base;
const seen = { auth: new Set(), flaky: 0 };

function routes() {
  return {
    '/users/Karelisio': { json: { login: 'Karelisio', name: 'Karel', bio: 'Bio', avatar_url: 'https://avatars.example/k', html_url: 'https://github.com/Karelisio', followers: 4, blog: 'karel.dev' } },
    '/users/Karelisio/repos?type=owner&sort=pushed&per_page=100': {
      json: [repo('Alpha'), repo('Fourche', { fork: true })],
      link: `<${base}/users/Karelisio/repos?page=2>; rel="next"`,
    },
    '/users/Karelisio/repos?page=2': { json: [repo('Beta', { language: 'Kotlin' }), repo('Vieux', { archived: true })] },
    '/repos/Karelisio/Alpha/releases?per_page=100': {
      json: [release(3, 'v3', '2026-09-03T00:00:00Z'), release(9, 'brouillon', null, { draft: true })],
      link: `<${base}/repos/Karelisio/Alpha/releases?page=2>; rel="next"`,
    },
    '/repos/Karelisio/Alpha/releases?page=2': { json: [release(1, 'v1', '2026-09-01T00:00:00Z')] },
    '/repos/Karelisio/Alpha/commits?per_page=1&sha=main': {
      json: [{ sha: 'abc', html_url: 'https://github.com/c/abc', author: { login: 'Karelisio' }, commit: { message: 'feat: tout\n\ncorps', committer: { date: '2026-09-02T00:00:00Z' } } }],
    },
    '/repos/Karelisio/Alpha/languages': { json: { TypeScript: 900, CSS: 100 } },
    '/repos/Karelisio/Alpha/pulls?state=open&per_page=1': {
      json: [{}],
      link: `<${base}/repositories/1/pulls?state=open&per_page=1&page=2>; rel="next", <${base}/repositories/1/pulls?state=open&per_page=1&page=3>; rel="last"`,
    },
    '/repos/Karelisio/Beta/releases?per_page=100': { json: [] },
    '/repos/Karelisio/Beta/commits?per_page=1&sha=main': { status: 409, json: { message: 'Git Repository is empty.' } },
    '/repos/Karelisio/Beta/languages': () => (seen.flaky++ === 0 ? { status: 502, json: { message: 'Bad Gateway' } } : { json: {} }),
    '/repos/Karelisio/Beta/pulls?state=open&per_page=1': { json: [] },
  };
}

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.auth.add(req.headers.authorization);
    let route = routes()[req.url];
    if (typeof route === 'function') route = route();
    if (!route) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: `Not Found: ${req.url}` }));
      return;
    }
    res.writeHead(route.status ?? 200, { 'content-type': 'application/json', ...(route.link ? { link: route.link } : {}) });
    res.end(JSON.stringify(route.json));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((r) => server.close(r)));

describe('fetch-data.mjs', () => {
  it('produit data.json à partir de l’API (pagination, exclusions, erreurs tolérées)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vitrine-'));
    const out = join(dir, 'data.json');
    try {
      await run(process.execPath, ['scripts/fetch-data.mjs', '--out', out], {
        cwd: ROOT,
        env: { ...process.env, GITHUB_API_URL: base, GITHUB_TOKEN: 'jeton-test', GITHUB_REPOSITORY: 'Karelisio/Mago' },
      });
      const data = JSON.parse(await readFile(out, 'utf8'));

      expect(seen.auth).toEqual(new Set(['Bearer jeton-test']));
      expect(data.source).toBe('Karelisio/Mago');
      expect(data.profile).toMatchObject({ login: 'Karelisio', name: 'Karel', blog: 'https://karel.dev/', followers: 4 });
      expect(data.repos.map((r) => r.name)).toEqual(['Alpha', 'Beta']);

      const [alpha, beta] = data.repos;
      expect(alpha.releaseCount).toBe(2);
      expect(alpha.releases.map((r) => r.tag)).toEqual(['v3', 'v1']);
      expect(alpha.openPulls).toBe(3);
      expect(alpha.openIssues).toBe(2);
      expect(alpha.lastCommit).toMatchObject({ sha: 'abc', message: 'feat: tout', author: 'Karelisio' });
      expect(alpha.languages).toEqual({ TypeScript: 900, CSS: 100 });

      expect(beta.lastCommit).toBeNull();
      expect(beta.releases).toEqual([]);
      expect(seen.flaky).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
