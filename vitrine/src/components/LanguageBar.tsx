import { motion, useReducedMotion } from 'framer-motion';
import { CONFIG } from '../config';
import { languageColor } from '../lib/languages';
import { emphasizedDecelerate } from '../lib/motion';
import { languageShares } from '../lib/repos';

const percent = new Intl.NumberFormat(CONFIG.locale, { style: 'percent', maximumFractionDigits: 1 });

/** Répartition des langages du dépôt, qui se remplit à l'apparition. */
export function LanguageBar({ languages }: { languages: Record<string, number> }) {
  const reduced = useReducedMotion();
  const shares = languageShares(languages);
  if (shares.length === 0) return null;
  const color = (name: string) => (name === 'Autres' ? 'var(--md-outline)' : languageColor(name));
  const label = shares.map((s) => `${s.name} ${percent.format(s.share)}`).join(', ');

  return (
    <div>
      <div role="img" aria-label={`Langages : ${label}`} className="flex h-2 gap-[3px] overflow-hidden rounded-full">
        {shares.map((s, i) => (
          <motion.span
            key={s.name}
            className="h-full min-w-1.5 rounded-full"
            style={{ width: `${s.share * 100}%`, background: color(s.name), originX: 0 }}
            initial={reduced ? false : { scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.15 + i * 0.08, ease: emphasizedDecelerate }}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-on-surface-variant" aria-hidden="true">
        {shares.slice(0, 3).map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: color(s.name) }} />
            {s.name}
            <span className="tabular-nums opacity-70">{percent.format(s.share)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
