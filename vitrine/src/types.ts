// Forme de public/data.json, produit par scripts/fetch-data.mjs (à garder alignés).

export interface VitrineData {
  /** Jeu de démonstration (projets fictifs) : la page affiche un bandeau. */
  demo?: boolean;
  generatedAt: string;
  /** Dépôt qui héberge la vitrine ("owner/repo"), connu seulement en CI. */
  source: string | null;
  profile: Profile;
  repos: Repo[];
}

export interface Profile {
  login: string;
  name: string | null;
  avatarUrl: string;
  htmlUrl: string;
  bio: string | null;
  location: string | null;
  blog: string | null;
  company: string | null;
  followers: number | null;
}

export interface Repo {
  name: string;
  fullName: string;
  description: string | null;
  htmlUrl: string;
  homepage: string | null;
  language: string | null;
  /** Octets par langage (endpoint /languages). */
  languages: Record<string, number>;
  topics: string[];
  stars: number;
  forks: number;
  /** Issues ouvertes, pull requests exclues. */
  openIssues: number;
  openPulls: number;
  hasIssues: boolean;
  license: string | null;
  fork: boolean;
  archived: boolean;
  defaultBranch: string;
  createdAt: string;
  pushedAt: string | null;
  lastCommit: Commit | null;
  /** Nombre total de releases publiées (peut dépasser releases.length). */
  releaseCount: number;
  /** Releases les plus récentes d'abord, tronquées à maxReleasesPerRepo. */
  releases: Release[];
}

export interface Commit {
  sha: string;
  message: string;
  date: string;
  url: string;
  author: string | null;
}

export interface Release {
  id: number;
  tag: string;
  name: string | null;
  publishedAt: string;
  url: string;
  /** Notes de version en Markdown (brut GitHub). */
  body: string;
  /** Extrait en texte brut, pour la timeline. */
  summary: string;
  prerelease: boolean;
  assets: Asset[];
  zipballUrl: string | null;
  tarballUrl: string | null;
}

export interface Asset {
  name: string;
  size: number;
  downloads: number;
  url: string;
  contentType: string;
}
