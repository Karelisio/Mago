import { useEffect } from 'react';
import { useImport } from '../contexts/ImportContext';

const AUTO_HIDE_MS = 6000;

export function Snackbar() {
  const { snackbar, hideSnackbar } = useImport();

  useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(hideSnackbar, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
    // Relancé à chaque nouveau message (id), pas à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snackbar?.id]);

  if (!snackbar) return null;

  return (
    <div className="snackbar" role="status" aria-live="polite">
      <span>{snackbar.message}</span>
      {snackbar.action && (
        <button
          className="snackbar-action"
          onClick={() => {
            const { onPress } = snackbar.action!;
            hideSnackbar();
            onPress();
          }}
        >
          {snackbar.action.label}
        </button>
      )}
    </div>
  );
}
