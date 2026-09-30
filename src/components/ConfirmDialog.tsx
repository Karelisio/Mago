import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  // Action irréversible (suppression, perte de données) : bouton en couleur d'erreur.
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirmation modale (Material 3), mêmes conventions que l'écran d'import
// (role dialog + aria-modal, par-dessus la navigation) : à utiliser avant
// toute action irréversible.
export function ConfirmDialog({ title, message, confirmLabel, destructive, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="dialog-scrim" onClick={busy ? undefined : onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <div id="confirm-dialog-message" className="dialog-message">
          {message}
        </div>
        <div className="dialog-actions">
          <button className="btn-text" onClick={onCancel} disabled={busy}>
            Annuler
          </button>
          <button className={`btn-text${destructive ? ' btn-danger' : ''}`} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
