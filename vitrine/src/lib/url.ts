import { DEFAULT_FILTERS, RELEASE_FILTERS, SORT_KEYS, type Filters, type ReleaseFilter, type SortKey } from './repos';

// État partageable dans l'URL : ?q=…&lang=Kotlin,TypeScript&release=with&sort=stars&repo=Mago&tag=v1.2
// (repo/tag = changelog ouvert). Valeurs par défaut omises, valeurs inconnues ignorées.

export interface UrlState extends Filters {
  repo: string | null;
  tag: string | null;
}

export const DEFAULT_URL_STATE: UrlState = { ...DEFAULT_FILTERS, repo: null, tag: null };

export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  const release = params.get('release') as ReleaseFilter | null;
  const sort = params.get('sort') as SortKey | null;
  const languages = (params.get('lang') ?? '')
    .split(',')
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    query: params.get('q') ?? '',
    languages: [...new Set(languages)],
    release: release && RELEASE_FILTERS.includes(release) ? release : DEFAULT_FILTERS.release,
    sort: sort && SORT_KEYS.includes(sort) ? sort : DEFAULT_FILTERS.sort,
    repo: params.get('repo') || null,
    tag: params.get('repo') ? params.get('tag') || null : null,
  };
}

/** Chaîne de recherche (« ?… » ou vide), en conservant les paramètres étrangers de `base`. */
export function serializeUrlState(state: UrlState, base = ''): string {
  const params = new URLSearchParams(base);
  const set = (key: string, value: string | null, fallback: string | null = null) => {
    if (value === null || value === '' || value === fallback) params.delete(key);
    else params.set(key, value);
  };
  set('q', state.query.trim() ? state.query : null);
  set('lang', state.languages.length ? state.languages.join(',') : null);
  set('release', state.release, DEFAULT_FILTERS.release);
  set('sort', state.sort, DEFAULT_FILTERS.sort);
  set('repo', state.repo);
  set('tag', state.repo ? state.tag : null);
  const out = params.toString();
  return out ? `?${out}` : '';
}
