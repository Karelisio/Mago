// Formes « Material 3 Expressive » (cookie, trèfle, fleur, éclat…) générées en
// coordonnées polaires. Toutes ont le même nombre de points : Framer Motion
// peut donc les morpher entre elles (attribut `d`), et CSS peut animer les
// `clip-path: polygon()` correspondants.

export const SHAPE_POINTS = 96;

interface ShapeSpec {
  /** Nombre de lobes (0 = cercle). */
  lobes: number;
  /** Profondeur des creux, en fraction du rayon. */
  depth: number;
  /** < 1 : lobes pleins et creux pincés ; > 1 : pointes plus fines. */
  power?: number;
}

const SPECS = {
  circle: { lobes: 0, depth: 0 },
  cookie4: { lobes: 4, depth: 0.1, power: 0.8 },
  cookie6: { lobes: 6, depth: 0.08, power: 0.8 },
  cookie7: { lobes: 7, depth: 0.075, power: 0.8 },
  cookie9: { lobes: 9, depth: 0.065, power: 0.8 },
  cookie12: { lobes: 12, depth: 0.05, power: 0.8 },
  clover4: { lobes: 4, depth: 0.2, power: 0.45 },
  clover8: { lobes: 8, depth: 0.13, power: 0.5 },
  flower: { lobes: 8, depth: 0.16, power: 0.7 },
  burst: { lobes: 10, depth: 0.12, power: 1.8 },
  sunny: { lobes: 8, depth: 0.07, power: 1.4 },
} satisfies Record<string, ShapeSpec>;

export type ShapeName = keyof typeof SPECS;

export const SHAPE_NAMES = Object.keys(SPECS) as ShapeName[];

/** Formes « décoratives » (hors cercle) attribuées aux dépôts. */
export const DECORATIVE_SHAPES = SHAPE_NAMES.filter((s) => s !== 'circle');

function radius(spec: ShapeSpec, theta: number): number {
  if (spec.lobes === 0) return 1;
  const wave = (1 + Math.cos(spec.lobes * theta)) / 2; // 1 au sommet d'un lobe, 0 au creux
  return 1 - spec.depth + spec.depth * Math.pow(wave, spec.power ?? 1);
}

/** Points normalisés dans [0, 1] × [0, 1], premier lobe vers le haut. */
export function shapePoints(name: ShapeName, count = SHAPE_POINTS): Array<[number, number]> {
  const spec: ShapeSpec = SPECS[name];
  const points: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const r = radius(spec, t) / 2;
    points.push([0.5 + r * Math.sin(t), 0.5 - r * Math.cos(t)]);
  }
  return points;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Chemin SVG dans une viewBox 0 0 100 100. */
export function shapePath(name: ShapeName): string {
  const pts = shapePoints(name).map(([x, y]) => `${round(x * 100)} ${round(y * 100)}`);
  return `M${pts.join('L')}Z`;
}

/** Valeur CSS `clip-path` équivalente (en pourcentages, donc responsive). */
export function shapeClipPath(name: ShapeName): string {
  const pts = shapePoints(name).map(([x, y]) => `${round(x * 100)}% ${round(y * 100)}%`);
  return `polygon(${pts.join(',')})`;
}

export function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Forme stable pour un nom donné (même dépôt ⇒ même forme). */
export function shapeFor(name: string): ShapeName {
  return DECORATIVE_SHAPES[hashString(name) % DECORATIVE_SHAPES.length];
}

const pathCache = new Map<ShapeName, string>();

export function cachedShapePath(name: ShapeName): string {
  let path = pathCache.get(name);
  if (!path) {
    path = shapePath(name);
    pathCache.set(name, path);
  }
  return path;
}
