import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useInvites } from '../hooks/useInvites';
import { useLists } from '../hooks/useLists';

export function Settings() {
  const { session, signOut } = useAuth();
  const { data: lists } = useLists();
  const { sent, received, sendInvite, acceptInvite, declineInvite } = useInvites();

  const [email, setEmail] = useState('');
  const [listId, setListId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function handleInvite() {
    if (!email.trim() || !listId) return;
    const { error } = await sendInvite(listId, email);
    setMessage(error ?? 'Invitation envoyée.');
    if (!error) setEmail('');
  }

  return (
    <div>
      <div className="top-bar">
        <h2>Réglages</h2>
      </div>

      <div className="card">
        <p>Connecté en tant que {session?.user.email}</p>
        <button className="btn-text" onClick={signOut}>
          Se déconnecter
        </button>
      </div>

      <h3>Inviter quelqu'un sur une liste</h3>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <select value={listId} onChange={(e) => setListId(e.target.value)}>
          <option value="">Choisir une liste</option>
          {(lists ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <input placeholder="Email à inviter" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn-primary" onClick={handleInvite}>
          Envoyer l'invitation
        </button>
        {message && <p>{message}</p>}
      </div>

      <h3>Invitations reçues</h3>
      {(received.data ?? []).length === 0 && <p>Aucune invitation en attente.</p>}
      {received.data?.map((inv) => (
        <div key={inv.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Invitation à rejoindre une liste (de {inv.from_user.slice(0, 8)}…)</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={() => acceptInvite(inv.id)}>
              Accepter
            </button>
            <button className="btn-text" onClick={() => declineInvite(inv.id)}>
              Refuser
            </button>
          </div>
        </div>
      ))}

      <h3>Invitations envoyées</h3>
      {(sent.data ?? []).length === 0 && <p>Aucune invitation envoyée.</p>}
      {sent.data?.map((inv) => (
        <div key={inv.id} className="card">
          {inv.to_email} — <em>{inv.status}</em>
        </div>
      ))}
    </div>
  );
}
