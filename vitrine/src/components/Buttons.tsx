import type { AnchorHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from '../lib/icons';

interface IconButtonProps extends ComponentProps<'button'> {
  label: string;
  icon?: IconName;
  children?: ReactNode;
}

export function IconButton({ label, icon, children, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`state-layer press-morph grid size-10 shrink-0 place-items-center rounded-full text-on-surface-variant hover:text-on-surface disabled:pointer-events-none disabled:opacity-40 ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} className="text-[1.2rem]" /> : children}
    </button>
  );
}

interface LinkChipProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  icon?: IconName;
  children: ReactNode;
}

/** Lien secondaire compact (Code, Issues, Releases…), ouvert dans un nouvel onglet. */
export function LinkChip({ icon, children, className = '', ...rest }: LinkChipProps) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className={`state-layer press-morph inline-flex h-9 items-center gap-1.5 rounded-full border border-accent-outline px-3.5 text-sm font-medium text-on-surface-variant hover:text-on-surface ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} className="text-[1.1rem]" />}
      {children}
    </a>
  );
}
