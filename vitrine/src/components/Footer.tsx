import { formatDateTime, relativeTime } from '../lib/format';
import { GithubMark, Icon } from './Icon';

interface FooterProps {
  generatedAt: string | null;
  source: string | null;
  demo?: boolean;
}

export function Footer({ generatedAt, source, demo = false }: FooterProps) {
  return (
    <footer className="border-t border-outline-variant/60 bg-surface-container-lowest/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-on-surface-variant sm:flex-row sm:items-center sm:px-6 lg:px-8">
        {demo && (
          <p className="flex items-center gap-2">
            <Icon name="auto_awesome" className="text-base" />
            Données de démonstration (projets fictifs).
          </p>
        )}
        {!demo && generatedAt && (
          <p className="flex items-center gap-2">
            <Icon name="refresh" className="text-base" />
            <span>
              Données mises à jour{' '}
              <time dateTime={generatedAt} title={formatDateTime(generatedAt)} className="font-semibold text-on-surface">
                {relativeTime(generatedAt)}
              </time>{' '}
              depuis l’API GitHub.
            </span>
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:ml-auto">
          {source && (
            <a
              href={`https://github.com/${source}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-on-surface hover:underline"
            >
              <GithubMark className="size-4" />
              Code de cette page
            </a>
          )}
          <a href="#top" className="inline-flex items-center gap-1 hover:text-on-surface hover:underline">
            Haut de page
            <Icon name="arrow_outward" className="-rotate-45 text-base" />
          </a>
        </div>
      </div>
    </footer>
  );
}
