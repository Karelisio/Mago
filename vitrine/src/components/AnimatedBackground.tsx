/**
 * Fond en dégradé animé : trois halos radiaux aux couleurs tonales de la
 * palette, qui dérivent lentement (CSS, figés si prefers-reduced-motion).
 */
export function AnimatedBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-surface">
      <div
        className="backdrop-blob -top-[25vmax] -left-[20vmax] size-[70vmax]"
        style={{ background: 'radial-gradient(closest-side, var(--md-primary-container), transparent)' }}
      />
      <div
        className="backdrop-blob top-[10vh] -right-[25vmax] size-[65vmax]"
        style={{ background: 'radial-gradient(closest-side, var(--md-tertiary-container), transparent)' }}
      />
      <div
        className="backdrop-blob -bottom-[30vmax] left-[15vw] size-[60vmax]"
        style={{ background: 'radial-gradient(closest-side, var(--md-secondary-container), transparent)' }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, transparent 40%, color-mix(in oklab, var(--md-surface) 85%, transparent) 100%)',
        }}
      />
    </div>
  );
}
