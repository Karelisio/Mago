import { motion, useReducedMotion } from 'framer-motion';
import { cachedShapePath, shapeFor, type ShapeName } from '../lib/shapes';
import { spring } from '../lib/motion';

/** Initiales d'un dépôt : « orbital-forge » → « OF », « Mago » → « Ma ». */
export function initials(name: string): string {
  const words = name.split(/[-_.\s]+|(?<=[a-z])(?=[A-Z])/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const word = words[0] ?? name;
  return word.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}

interface MonogramProps {
  name: string;
  shape?: ShapeName;
  className?: string;
}

/**
 * Monogramme dans une forme M3 Expressive. Réagit aux variantes « rest » /
 * « hover » propagées par la carte parente : la forme s'arrondit et tourne.
 */
export function ShapeMonogram({ name, shape = shapeFor(name), className = 'size-14' }: MonogramProps) {
  const reduced = useReducedMotion();
  const rest = cachedShapePath(shape);
  const hover = cachedShapePath('circle');
  return (
    <div className={`relative grid shrink-0 place-items-center ${className}`} aria-hidden="true">
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full overflow-visible"
        variants={reduced ? undefined : { rest: { rotate: 0 }, hover: { rotate: 40 } }}
        transition={spring.slowSpatial}
      >
        <motion.path
          d={rest}
          className="fill-accent-container"
          variants={reduced ? undefined : { rest: { d: rest }, hover: { d: hover } }}
          transition={spring.spatial}
        />
      </motion.svg>
      <span className="relative text-lg font-bold tracking-tight text-on-accent-container [font-stretch:110%]">
        {initials(name)}
      </span>
    </div>
  );
}
