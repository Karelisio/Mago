import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await signInWithMagicLink(email);
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      setSent(true);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', padding: 24 }}>
      <h1 style={{ color: 'var(--md-primary)' }}>Mago</h1>
      {sent ? (
        <p>Un lien de connexion a été envoyé à <strong>{email}</strong>. Vérifie ta boîte mail.</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label htmlFor="email">Adresse email</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="toi@example.com"
          />
          {error && <p style={{ color: 'var(--md-error)' }}>{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Envoi…' : 'Recevoir un lien de connexion'}
          </button>
        </form>
      )}
    </div>
  );
}
