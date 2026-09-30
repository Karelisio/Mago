#!/usr/bin/env node
// Récupère les dépôts publics d'un compte GitHub (API REST) et génère
// public/data.json, lu tel quel par la page (aucun appel à l'API côté visiteur).
//
//   GITHUB_TOKEN=xxx node scripts/fetch-data.mjs [--repos a,b] [--out chemin]
//
// Coût : 2 requêtes + ~4 par dépôt (releases, dernier commit, langages, PR ouvertes).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_RETRIES,
  USAGE,
  countFromLink,
  mapLimit,
  nextLink,
  normalizeConfig,
  parseArgs,
  prepareReleases,
  retryDelayMs,
  selectRepos,
  toCommit,
  toProfile,
  toRepo,
} from './transform.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const CONCURRENCY = 4;

const HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'vitrine-fetch-data',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

class HttpError extends Error {
  constructor(status, url, detail) {
    super(`HTTP ${status} sur ${url}${detail ? ` — ${detail}` : ''}`);
    this.status = status;
  }
}

let requestCount = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function errorDetail(res) {
  let message = '';
  try {
    message = (await res.json()).message ?? '';
  } catch {
    // corps non JSON : on garde juste le statut
  }
  if (res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = new Date(Number(res.headers.get('x-ratelimit-reset')) * 1000);
    message = `quota de l'API épuisé jusqu'à ${reset.toLocaleTimeString('fr-FR')}${TOKEN ? '' : ' (définis GITHUB_TOKEN)'}`;
  }
  return message;
}

/** GET JSON, avec nouvelles tentatives (5xx, limites secondaires) ; `allow` = statuts non fatals. */
async function request(pathOrUrl, { allow = [] } = {}) {
  const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${API}${pathOrUrl}`;
  for (let attempt = 0; ; attempt++) {
    requestCount++;
    let res;
    try {
      res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new Error(`Réseau injoignable (${url}) : ${err.message}`);
    }
    if (res.ok) return { status: res.status, data: res.status === 204 ? null : await res.json(), link: res.headers.get('link') };
    if (allow.includes(res.status)) {
      await res.body?.cancel();
      return { status: res.status, data: null, link: null };
    }
    const wait = retryDelayMs(res.status, (name) => res.headers.get(name), attempt);
    if (wait !== null) {
      console.warn(`  … HTTP ${res.status} sur ${url}, nouvel essai dans ${Math.ceil(wait / 1000)} s`);
      await res.body?.cancel();
      await sleep(wait);
      continue;
    }
    throw new HttpError(res.status, url, await errorDetail(res));
  }
}

async function paginate(path, max = Infinity) {
  const items = [];
  let url = path;
  while (url && items.length < max) {
    const { data, link } = await request(url);
    if (!Array.isArray(data)) break;
    items.push(...data);
    url = nextLink(link);
  }
  return items.slice(0, max);
}

async function fetchRepo(raw, config) {
  const base = `/repos/${raw.full_name}`;
  const [releases, commits, languages, pulls] = await Promise.all([
    paginate(`${base}/releases?per_page=100`, 1000),
    // 409 : dépôt vide (aucun commit)
    request(`${base}/commits?per_page=1&sha=${encodeURIComponent(raw.default_branch)}`, { allow: [404, 409] }),
    request(`${base}/languages`, { allow: [404] }),
    request(`${base}/pulls?state=open&per_page=1`, { allow: [404] }),
  ]);
  const { count, releases: kept } = prepareReleases(releases, raw.html_url, config.maxReleasesPerRepo);
  return toRepo(raw, {
    releases: kept,
    releaseCount: count,
    lastCommit: toCommit(commits.data?.[0]),
    languages: languages.data ?? {},
    openPulls: Array.isArray(pulls.data) ? countFromLink(pulls.link, pulls.data.length) : 0,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  const config = normalizeConfig(JSON.parse(await readFile(resolve(ROOT, 'config.json'), 'utf8')));
  const out = resolve(ROOT, args.out ?? 'public/data.json');
  if (!TOKEN) console.warn('⚠ Pas de GITHUB_TOKEN : l’API est limitée à 60 requêtes/heure.');

  console.log(`→ Profil de ${config.username}`);
  let user = null;
  try {
    user = (await request(`/users/${encodeURIComponent(config.username)}`)).data;
  } catch (err) {
    if (err.status === 404) throw new Error(`Utilisateur GitHub « ${config.username} » introuvable.`);
    console.warn(`⚠ Profil indisponible (${err.message}) : repli sur le propriétaire des dépôts.`);
  }

  const raws = args.repos.length
    ? await mapLimit(args.repos, CONCURRENCY, async (name) => {
        const full = name.includes('/') ? name : `${config.username}/${name}`;
        return (await request(`/repos/${full}`)).data;
      })
    : await paginate(`/users/${encodeURIComponent(config.username)}/repos?type=owner&sort=pushed&per_page=100`);

  const selected = selectRepos(raws, config);
  console.log(`→ ${selected.length} dépôt(s) retenu(s) sur ${raws.length} (forks/archivés/exclus filtrés)`);

  const repos = await mapLimit(selected, CONCURRENCY, async (raw) => {
    const repo = await fetchRepo(raw, config);
    console.log(`  ✓ ${repo.name} · ${repo.releaseCount} release(s)`);
    return repo;
  });

  const data = {
    generatedAt: new Date().toISOString(),
    source: process.env.GITHUB_REPOSITORY || null,
    profile: toProfile(user, raws[0]?.owner, config.username),
    repos,
  };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`✔ ${relative(process.cwd(), out)} : ${repos.length} dépôts, ${requestCount} requêtes`);
}

main().catch((err) => {
  console.error(`✖ ${err.message}`);
  process.exitCode = 1;
});
