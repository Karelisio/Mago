import { motion } from 'framer-motion';
import { spring } from '../lib/motion';
import { cachedShapePath, type ShapeName } from '../lib/shapes';
import type { IconName } from '../lib/icons';
import { Icon } from './Icon';

export function LoadingState() {
  return (
    <div aria-busy="true" aria-label="Chargement des projets" className="pt-10">
      <div className="flex flex-col items-center gap-6 md:flex-row md:gap-12">
        <div className="skeleton size-36 rounded-full sm:size-44" />
        <div className="flex w-full max-w-xl flex-col items-center gap-3 md:items-start">
          <div className="skeleton h-4 w-32 rounded-full" />
          <div className="skeleton h-14 w-3/4 rounded-2xl" />
          <div className="skeleton h-4 w-full rounded-full" />
          <div className="skeleton h-4 w-2/3 rounded-full" />
        </div>
      </div>
      <div className="mt-10 grid gap-3 sm:grid-cols-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-24 rounded-card" />
        ))}
      </div>
      <div className="mt-16 grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-80 rounded-card" />
        ))}
      </div>
    </div>
  );
}

function Illustration({ icon, shape }: { icon: IconName; shape: ShapeName }) {
  return (
    <motion.div
      className="relative grid size-24 place-items-center text-secondary-container"
      initial={{ scale: 0.6, rotate: -30, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={spring.slowSpatial}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" className="spin-slow absolute inset-0 size-full">
        <path d={cachedShapePath(shape)} className="fill-current" />
      </svg>
      <Icon name={icon} className="relative text-4xl text-on-secondary-container" />
    </motion.div>
  );
}

export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-surface-container-low/80 px-6 py-16 text-center">
      <Illustration icon="search_off" shape="cookie9" />
      <h3 className="type-title">{title}</h3>
      <p className="max-w-md text-on-surface-variant">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="state-layer press-morph mt-2 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-on-primary"
        >
          <Icon name="refresh" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-16 flex max-w-xl flex-col items-center gap-4 rounded-card bg-error-container/60 px-6 py-14 text-center">
      <Illustration icon="error" shape="burst" />
      <h2 className="type-title text-on-error-container">Impossible de charger les projets</h2>
      <p className="text-on-error-container/90">{message}</p>
      <p className="text-sm text-on-error-container/80">
        En local, génère d’abord les données avec <code className="font-mono">npm run fetch-data</code>.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="state-layer press-morph mt-2 inline-flex h-11 items-center gap-2 rounded-full bg-error px-6 text-sm font-semibold text-on-error"
      >
        <Icon name="refresh" />
        Réessayer
      </button>
    </div>
  );
}
