import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Sans ça, la moindre exception pendant un rendu (ex: donnée inattendue
// venant de Supabase) fait disparaître toute l'app sans le moindre message —
// juste le fond de la page, vide. Voir CLAUDE.md.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Oups, une erreur est survenue</h2>
          <p style={{ color: 'var(--md-error)', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap' }}>
            {this.state.error.message}
          </p>
          <button className="btn-primary" onClick={() => location.reload()}>
            Recharger l'app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
