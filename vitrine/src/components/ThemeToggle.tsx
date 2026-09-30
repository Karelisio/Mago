import { AnimatePresence, motion } from 'framer-motion';
import { useTheme } from '../theme/ThemeProvider';
import { spring } from '../lib/motion';
import { Icon } from './Icon';

export function ThemeToggle() {
  const { mode, toggleMode } = useTheme();
  const toLight = mode === 'dark';
  const label = toLight ? 'Passer au thème clair' : 'Passer au thème sombre';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        toggleMode({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      className="state-layer press-morph grid size-10 place-items-center overflow-hidden rounded-full text-on-surface-variant hover:text-on-surface"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={mode}
          className="grid place-items-center"
          initial={{ rotate: -120, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 120, scale: 0.4, opacity: 0 }}
          transition={spring.fastSpatial}
        >
          <Icon name={toLight ? 'light_mode' : 'dark_mode'} className="text-[1.2rem]" />
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
