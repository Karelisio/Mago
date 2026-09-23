import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useInvites } from '../hooks/useInvites';
import { useLists } from '../hooks/useLists';
import { usePartnership } from '../hooks/usePartnership';
import { SyncDiagnostics } from '../components/SyncDiagnostics';
import { MagoIcon } from '../components/MagoIcon';
import { useAppUpdate } from '../hooks/useAppUpdate';

export function Settings() {
  const { session, signOut } = useAuth();
  const { data: lists } = useLists();
  const { sent, received, sendInvite, acceptInvite, declineInvite } = useInvites();
  const partner = usePartnership();
  const update = useAppUpdate();

  const [email, setEmail] = useState('');
  const [listId, setListId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerMessage, setPartnerMessage] = useState<string | null>(null);

  async function handleInvite() {
    if (!email.trim() || !listId) return;
    const { error } = await sendInvite(listId, email);
    setMessage(error ?? 'Invitation envoyée.');
    if (!error) setEmail('');
  }

  async function handlePartnerInvite() {
    if (!partnerEmail.trim()) return;
    const { error } = await partner.sendPartnerInvite(partnerEmail);
    setPartnerMessage(error ?? 'Invitation envoyée.');
    if (!error) setPartnerEmail('');
  }

  return (
    <div>
      <div className="top-bar">
        <div className="top-bar-title">
          <MagoIcon size={28} />
          <div>
            <h1>Mago</h1>
            <p className="top-bar-subtitle">Réglages</p>
          </div>
        </div>
      </div>

      <div className="card">
        <p>Connecté en tant que {session?.user.email}</p>
        <button className="btn-text" onClick={signOut}>
          Se déconnecter
        </button>
      </div>

      <h3>Mise à jour</h3>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontSize: 12, color: 'var(--md-on-surface-variant)' }}>
          Version installée : {update.currentVersion ?? 'inconnue (build de développement)'}
        </p>
        {update.checking && <p>Vérification des mises à jour…</p>}
        {update.latest && (
          <>
            <p>
              Nouvelle version disponible : <strong>{update.latest.tag}</strong>
            </p>
            {update.latest.changelog && (
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{update.latest.changelog}</pre>
            )}
            {update.canInstall ? (
              <button className="btn-primary" onClick={update.install} disabled={update.installing}>
                {update.installing ? 'Téléchargement…' : 'Télécharger et installer'}
              </button>
            ) : (
              <a
                href={update.latest.apkUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-text"
                style={{ textAlign: 'center', textDecoration: 'none' }}
              >
                Télécharger l'APK
              </a>
            )}
          </>
        )}
        {!update.checking && !update.latest && !update.error && <p>Mago est à jour.</p>}
        {update.error && <p style={{ color: 'var(--md-error)' }}>{update.error}</p>}
        <button className="btn-text" onClick={update.checkForUpdate} disabled={update.checking}>
          Vérifier à nouveau
        </button>
      </div>

      <h3>Diagnostic de synchronisation</h3>
      <SyncDiagnostics />

      <h3>Mon/ma partenaire</h3>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {partner.partnership.data ? (
          <p>
            Vous êtes jumelé·e avec votre partenaire : toute nouvelle liste que l'un de vous crée est
            automatiquement partagée avec l'autre.
          </p>
        ) : partner.sentInvite.data ? (
          <p>Invitation envoyée à <strong>{partner.sentInvite.data.to_email}</strong>, en attente de réponse.</p>
        ) : (
          <>
            <p>Pas encore de partenaire jumelé·e. Une fois accepté, vous partagerez automatiquement toutes vos listes.</p>
            <input
              placeholder="Email de ta/ton partenaire"
              value={partnerEmail}
              onChange={(e) => setPartnerEmail(e.target.value)}
            />
            <button className="btn-primary" onClick={handlePartnerInvite}>
              Inviter comme partenaire
            </button>
            {partnerMessage && <p>{partnerMessage}</p>}
          </>
        )}
      </div>

      {(partner.receivedInvites.data ?? []).length > 0 && (
        <>
          <h3>Invitations de partenaire reçues</h3>
          {partner.receivedInvites.data?.map((inv) => (
            <div
              key={inv.id}
              className="card"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>Invitation à devenir partenaires</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={() => partner.acceptPartnerInvite(inv.id)}>
                  Accepter
                </button>
                <button className="btn-text" onClick={() => partner.declinePartnerInvite(inv.id)}>
                  Refuser
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <h3>Inviter quelqu'un sur une seule liste</h3>
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

      <h3>Invitations de liste reçues</h3>
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

      <h3>Invitations de liste envoyées</h3>
      {(sent.data ?? []).length === 0 && <p>Aucune invitation envoyée.</p>}
      {sent.data?.map((inv) => (
        <div key={inv.id} className="card">
          {inv.to_email} — <em>{inv.status}</em>
        </div>
      ))}
    </div>
  );
}
