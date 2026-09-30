import type { Transition } from 'framer-motion';

// Ressorts « Material 3 Expressive » (motion physics) convertis pour Framer
// Motion : damping = ratio × 2√(stiffness × masse), masse = 1.
export const spring = {
  fastSpatial: { type: 'spring', stiffness: 800, damping: 34 },
  spatial: { type: 'spring', stiffness: 380, damping: 31 },
  slowSpatial: { type: 'spring', stiffness: 200, damping: 23 },
  fastEffects: { type: 'spring', stiffness: 3800, damping: 123 },
  effects: { type: 'spring', stiffness: 1600, damping: 80 },
} satisfies Record<string, Transition>;

/** Courbe « emphasized » de M3, pour les animations de hauteur (pas de rebond). */
export const emphasized = [0.2, 0, 0, 1] as const;
export const emphasizedDecelerate = [0.05, 0.7, 0.1, 1] as const;
