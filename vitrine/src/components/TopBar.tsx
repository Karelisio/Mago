import { useEffect, useState } from 'react';
import { CONFIG } from '../config';
import type { Profile } from '../types';
import { AccentPicker } from './AccentPicker';
import { GithubMark } from './Icon';
import { ThemeToggle } from './ThemeToggle';

export function TopBar({ profile }: { profile: Profile | null }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const login = profile?.login ?? CONFIG.username;

  return (
    <header
      className={`sticky top-0 z-30 transition-[background-color,box-shadow,backdrop-filter] duration-300 ease-emphasized ${
        scrolled ? 'bg-surface-container/75 shadow-[var(--elevation-1)] backdrop-blur-xl' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <a href="#top" className="state-layer flex min-w-0 items-center gap-3 rounded-full py-1 pr-3 pl-1">
          {profile?.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" width={32} height={32} className="size-8 rounded-full bg-surface-container-high" />
          ) : (
            <span className="size-8 rounded-full bg-primary-container" />
          )}
          <span className="truncate font-semibold [font-stretch:108%]">{profile?.name ?? login}</span>
        </a>
        <nav className="ml-auto flex items-center gap-1" aria-label="Préférences">
          <AccentPicker avatarUrl={profile?.avatarUrl} />
          <ThemeToggle />
          <a
            href={profile?.htmlUrl ?? `https://github.com/${login}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Profil GitHub"
            title="Profil GitHub"
            className="state-layer press-morph grid size-10 place-items-center rounded-full text-on-surface-variant hover:text-on-surface"
          >
            <GithubMark className="size-5" />
          </a>
        </nav>
      </div>
    </header>
  );
}
