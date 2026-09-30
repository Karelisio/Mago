// Transformations pures des réponses de l'API REST GitHub vers le format de
// public/data.json (type VitrineData de src/types.ts, à garder alignés).
// Aucun accès réseau ici : tout est testé dans transform.test.mjs.

export const MAX_RETRIES = 3;

const DEFAULTS = {
  username: '',
  excludeForks: true,
  excludeArchived: true,
  excludeRepos: [],
  maxReleasesPerRepo: 15,
};

const clampInt = (value, min, max, fallback) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

/** Réglages de config.json utiles au script, validés (valeurs par défaut sinon). */
export function normalizeConfig(raw) {
  const c = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  const username = typeof c.username === 'string' ? c.username.trim() : '';
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(username)) {
    throw new Error(`config.json : "username" invalide (${JSON.stringify(c.username)})`);
  }
  return {
    username,
    excludeForks: c.excludeForks !== false,
    excludeArchived: c.excludeArchived !== false,
    excludeRepos: Array.isArray(c.excludeRepos)
      ? c.excludeRepos.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim().toLowerCase())
      : [],
    maxReleasesPerRepo: clampInt(c.maxReleasesPerRepo, 1, 100, DEFAULTS.maxReleasesPerRepo),
  };
}

export const USAGE = `Usage : node scripts/fetch-data.mjs [options]

  --repos a,b     Seulement ces dépôts ("nom" ou "owner/nom"), sans lister le compte
  --out chemin    Fichier généré (défaut : public/data.json)
  -h, --help      Cette aide

Jeton : variable GITHUB_TOKEN (ou GH_TOKEN). Sans jeton, 60 requêtes/heure.`;

const REPO_ARG = /^(?:[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}\/)?[\w.-]+$/i;

export function parseArgs(argv) {
  const args = { repos: [], out: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    const value = () => {
      if (eq > 0) return arg.slice(eq + 1);
      const next = argv[++i];
      if (next === undefined || next.startsWith('--')) throw new Error(`Valeur manquante pour ${flag}`);
      return next;
    };
    switch (flag) {
      case '--repos':
        for (const name of value().split(',').map((s) => s.trim()).filter(Boolean)) {
          if (!REPO_ARG.test(name)) throw new Error(`Nom de dépôt invalide : ${name}`);
          args.repos.push(name);
        }
        break;
      case '--out':
        args.out = value();
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
      default:
        throw new Error(`Option inconnue : ${arg}\n\n${USAGE}`);
    }
  }
  return args;
}

/** Dépôts publics à afficher selon config.json (forks, archivés, exclusions). */
export function selectRepos(repos, config) {
  const excluded = new Set(config.excludeRepos);
  return repos.filter(
    (r) =>
      !r.private &&
      !r.disabled &&
      !(config.excludeForks && r.fork) &&
      !(config.excludeArchived && r.archived) &&
      !excluded.has(r.name.toLowerCase()) &&
      !excluded.has(String(r.full_name).toLowerCase()),
  );
}

/** URL http(s) sûre (le champ est libre côté GitHub), schéma ajouté si absent. */
export function safeUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const trimOrNull = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function licenseLabel(license) {
  if (!license) return null;
  if (license.spdx_id && license.spdx_id !== 'NOASSERTION') return license.spdx_id;
  if (!license.name || license.name === 'Other') return 'Autre';
  return license.name;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** Extrait en texte brut des notes de version (Markdown GitHub), pour la timeline. */
export function summarize(markdown, max = 180) {
  if (typeof markdown !== 'string' || !markdown.trim()) return '';
  const text = markdown
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ');

  const lines = [];
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line) continue;
    if (/^#{1,6}\s/.test(line)) continue; // titres (« What's Changed »…)
    if (/^[-*_]{3,}$/.test(line)) continue; // séparateurs
    if (/^\|?[\s:|-]+\|[\s:|-]*$/.test(line)) continue; // lignes de tableau « |---| »
    if (/^\W*full changelog\W*:/i.test(line)) continue;
    line = line.replace(/^>\s?/, '').replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '');
    if (line) lines.push(line);
  }

  let out = lines
    .join(' · ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // liens → texte
    .replace(/<[^>]+>/g, ' ') // HTML
    .replace(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(?:pull|issues)\/(\d+)\S*/g, '#$1')
    .replace(/ by @[\w-]+ in (#\d+)/g, ' ($1)')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*·\s*)+/g, ' · ')
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
    .trim();

  if (out.length <= max) return out;
  const cut = out.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  out = (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s·,;:.(-]+$/, '');
  return `${out}…`;
}

const encodeTag = (tag) => tag.split('/').map(encodeURIComponent).join('/');

export function toRelease(raw, repoHtmlUrl) {
  const body = typeof raw.body === 'string' ? raw.body.replace(/\r\n?/g, '\n') : '';
  const archive = `${repoHtmlUrl}/archive/refs/tags/${encodeTag(raw.tag_name)}`;
  return {
    id: raw.id,
    tag: raw.tag_name,
    name: trimOrNull(raw.name),
    publishedAt: raw.published_at ?? raw.created_at,
    url: raw.html_url,
    body,
    summary: summarize(body),
    prerelease: !!raw.prerelease,
    assets: (raw.assets ?? [])
      .filter((a) => !a.state || a.state === 'uploaded')
      .map((a) => ({
        name: a.name,
        size: a.size ?? 0,
        downloads: a.download_count ?? 0,
        url: a.browser_download_url,
        contentType: a.content_type || 'application/octet-stream',
      })),
    zipballUrl: `${archive}.zip`,
    tarballUrl: `${archive}.tar.gz`,
  };
}

const releaseTime = (r) => Date.parse(r.published_at ?? r.created_at ?? '') || 0;

/** Releases publiées (brouillons exclus), les plus récentes d'abord, tronquées à `max`. */
export function prepareReleases(rawReleases, repoHtmlUrl, max) {
  const published = rawReleases.filter((r) => !r.draft && (r.published_at || r.created_at));
  published.sort((a, b) => releaseTime(b) - releaseTime(a));
  return {
    count: published.length,
    releases: published.slice(0, max).map((r) => toRelease(r, repoHtmlUrl)),
  };
}

export function toCommit(raw) {
  const date = raw?.commit?.committer?.date ?? raw?.commit?.author?.date;
  if (!raw?.sha || !date) return null;
  const firstLine = String(raw.commit.message ?? '').split('\n')[0].trim();
  return {
    sha: raw.sha,
    message: firstLine.length > 140 ? `${firstLine.slice(0, 139)}…` : firstLine,
    date,
    url: raw.html_url,
    author: raw.author?.login ?? raw.commit.author?.name ?? null,
  };
}

export function toRepo(raw, { releases, releaseCount, lastCommit, languages, openPulls }) {
  const pulls = Number.isFinite(openPulls) ? openPulls : 0;
  return {
    name: raw.name,
    fullName: raw.full_name,
    description: trimOrNull(raw.description),
    htmlUrl: raw.html_url,
    homepage: safeUrl(raw.homepage),
    language: raw.language ?? null,
    languages: languages && typeof languages === 'object' ? languages : {},
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    stars: raw.stargazers_count ?? 0,
    forks: raw.forks_count ?? 0,
    // open_issues_count de GitHub compte aussi les pull requests ouvertes.
    openIssues: Math.max(0, (raw.open_issues_count ?? 0) - pulls),
    openPulls: pulls,
    hasIssues: !!raw.has_issues,
    license: licenseLabel(raw.license),
    fork: !!raw.fork,
    archived: !!raw.archived,
    defaultBranch: raw.default_branch ?? 'main',
    createdAt: raw.created_at,
    pushedAt: raw.pushed_at ?? null,
    lastCommit: lastCommit ?? null,
    releaseCount: releaseCount ?? releases.length,
    releases,
  };
}

/** Profil ; si /users/{login} est indisponible, repli sur le propriétaire d'un dépôt. */
export function toProfile(user, owner, username) {
  const source = user ?? owner ?? {};
  const login = source.login ?? username;
  return {
    login,
    name: trimOrNull(user?.name),
    avatarUrl: source.avatar_url ?? `https://github.com/${login}.png`,
    htmlUrl: source.html_url ?? `https://github.com/${login}`,
    bio: trimOrNull(user?.bio),
    location: trimOrNull(user?.location),
    blog: safeUrl(user?.blog),
    company: trimOrNull(user?.company),
    followers: typeof user?.followers === 'number' ? user.followers : null,
  };
}

function linkWithRel(link, rel) {
  if (!link) return null;
  for (const part of link.split(',')) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match && match[2].split(/\s+/).includes(rel)) return match[1];
  }
  return null;
}

export const nextLink = (link) => linkWithRel(link, 'next');

/** Nombre total d'éléments d'une liste demandée avec per_page=1 (numéro de la dernière page). */
export function countFromLink(link, pageLength) {
  const last = linkWithRel(link, 'last');
  if (!last) return pageLength;
  const page = Number(new URL(last).searchParams.get('page'));
  return Number.isFinite(page) && page > 0 ? page : pageLength;
}

/**
 * Délai avant un nouvel essai (ms), ou null s'il ne faut pas réessayer :
 * limites secondaires (Retry-After), quota épuisé mais bientôt rétabli, erreurs 5xx.
 */
export function retryDelayMs(status, header, attempt, now = Date.now()) {
  if (attempt >= MAX_RETRIES) return null;
  const limited = status === 403 || status === 429;
  const retryAfter = Number(header('retry-after'));
  if (limited && retryAfter > 0) return retryAfter <= 120 ? retryAfter * 1000 : null;
  if (limited && header('x-ratelimit-remaining') === '0') {
    const wait = Number(header('x-ratelimit-reset')) * 1000 - now + 1000;
    return Number.isFinite(wait) && wait > 0 && wait <= 120_000 ? wait : null;
  }
  if (status >= 500 || status === 429) return 1000 * 2 ** attempt;
  return null;
}

/** `Promise.all` avec au plus `limit` tâches simultanées ; l'ordre est conservé. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
