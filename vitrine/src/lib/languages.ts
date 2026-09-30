import { Hct, hexFromArgb } from '@material/material-color-utilities';
import { hashString } from './shapes';

// Couleurs GitHub Linguist des langages courants. Un langage absent reçoit une
// teinte stable dérivée de son nom.
const LINGUIST: Record<string, string> = {
  Assembly: '#6E4C13',
  Astro: '#ff5a03',
  Batchfile: '#C1F12E',
  C: '#555555',
  'C#': '#178600',
  'C++': '#f34b7d',
  Clojure: '#db5855',
  CMake: '#DA3434',
  CSS: '#663399',
  Dart: '#00B4AB',
  Dockerfile: '#384d54',
  Elixir: '#6e4a7e',
  Elm: '#60B5CC',
  Erlang: '#B83998',
  'F#': '#b845fc',
  GDScript: '#355570',
  GLSL: '#5686a5',
  Go: '#00ADD8',
  Groovy: '#4298b8',
  HCL: '#844FBA',
  HTML: '#e34c26',
  Haskell: '#5e5086',
  Java: '#b07219',
  JavaScript: '#f1e05a',
  Julia: '#a270ba',
  'Jupyter Notebook': '#DA5B0B',
  Kotlin: '#A97BFF',
  Lua: '#000080',
  MATLAB: '#e16737',
  MDX: '#fcb32c',
  Makefile: '#427819',
  Markdown: '#083fa1',
  Nim: '#ffc200',
  Nix: '#7e7eff',
  OCaml: '#ef7a08',
  'Objective-C': '#438eff',
  PHP: '#4F5D95',
  PLpgSQL: '#336790',
  Perl: '#0298c3',
  PowerShell: '#012456',
  Python: '#3572A5',
  QML: '#44a51c',
  R: '#198CE7',
  Ruby: '#701516',
  Rust: '#dea584',
  SCSS: '#c6538c',
  Scala: '#c22d40',
  Shell: '#89e051',
  Solidity: '#AA6746',
  Svelte: '#ff3e00',
  Swift: '#F05138',
  TeX: '#3D6117',
  TypeScript: '#3178c6',
  'Vim Script': '#199f4b',
  Vue: '#41b883',
  WebAssembly: '#04133b',
  Zig: '#ec915c',
};

const NO_LANGUAGE = '#8f8a99';

export function languageColor(language: string | null | undefined): string {
  if (!language) return NO_LANGUAGE;
  const known = LINGUIST[language];
  if (known) return known.toLowerCase();
  return hexFromArgb(Hct.from(hashString(language) % 360, 48, 62).toInt());
}

/** Clé CSS stable (`data-accent`) pour un langage. */
export function accentKey(language: string | null | undefined): string {
  if (!language) return 'none';
  const slug = language
    .toLowerCase()
    .replace(/\+/g, 'p')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `lang-${slug || hashString(language).toString(36)}`;
}
