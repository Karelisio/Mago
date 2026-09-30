import { AnimatePresence, motion } from 'framer-motion';
import { spring } from '../lib/motion';
import type { Repo } from '../types';
import { RepoCard } from './RepoCard';

interface RepoGridProps {
  repos: Repo[];
  onOpenChangelog: (repo: Repo, trigger: HTMLElement) => void;
}

/**
 * Grille des dépôts : apparition en cascade au scroll, et réorganisation
 * animée (layout) quand les filtres ou le tri changent.
 */
export function RepoGrid({ repos, onOpenChangelog }: RepoGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3" aria-label="Projets">
      <AnimatePresence mode="popLayout">
        {repos.map((repo, i) => (
          <motion.li
            key={repo.fullName}
            layout
            className="h-full"
            initial={{ opacity: 0, y: 36, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.12 }}
            exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
            transition={{ ...spring.spatial, delay: (i % 3) * 0.07, layout: spring.spatial }}
          >
            <RepoCard repo={repo} onOpenChangelog={onOpenChangelog} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
