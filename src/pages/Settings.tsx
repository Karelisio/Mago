import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useInvites } from '../hooks/useInvites';
import { useLists } from '../hooks/useLists';
import { usePartnership } from '../hooks/usePartnership';
import { useListCategories, useItemCategories } from '../hooks/useCategories';
import { useWidgetListId, setWidgetListId } from '../hooks/useWidgetListPref';
import { getThemePreference, setThemePreference, type ThemePreference } from '../lib/theme';
import { MagoIcon } from '../components/MagoIcon';
import { useAppUpdate } from '../hooks/useAppUpdate';

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'Système',
  light: 'Claire',
  dark: 'Sombre',
};

function ThemePicker() {
  const [pref, setPref] = useState<ThemePreference>(getThemePreference);

  function choose(next: ThemePreference) {
    setThemePreference(next);
    setPref(next);
  }

  return (
    <div className="card" style={{ display: 'flex', gap: 8 }}>
      {(Object.keys(THEME_LABELS) as ThemePreference[]).map((p) => (
        <button
          key={p}
          className={pref === p ? 'btn-primary' : 'btn-text'}
          style={{ flex: 1 }}
          onClick={() => choose(p)}
        >
          {THEME_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

function CategoryManager({
  title,
  categories,
  addCategory,
  deleteCategory,
}: {
  title: string;
  categories: { id: string; name: string }[];
  addCategory: (name: string) => Promise<{ error: string | null }>;
  deleteCategory: (id: string) => Promise<{ error: string | null }>;
}) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function handleAdd() {
    if (!name.trim()) return;
    const { error } = await addCategory(name);
    setMessage(error);
    if (!error) setName('');
  }

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <strong>{title}</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {categories.map((c) => (
          <span
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--md-surface-variant)',
              borderRadius: 16,
              padding: '4px 8px 4px 12px',
              fontSize: 13,
            }}
          >
            {c.name}
            <button
              className="btn-text"
              style={{ padding: 0, minWidth: 0, lineHeight: 1 }}
              onClick={() => deleteCategory(c.id)}
              aria-label={`Supprimer ${c.name}`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Nouvelle catégorie" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
        <button className="btn-primary" onClick={handleAdd}>
          Ajouter
        </button>
      </div>
      {message && <p style={{ color: 'var(--md-error)', margin: 0 }}>{message}</p>}
    </div>
  );
}

export function Settings() {
  const { session, signOut } = useAuth();
  const { data: lists } = useLists();
  const { sent, received, sendInvite, acceptInvite, declineInvite } = useInvites();
  const partner = usePartnership();
  const update = useAppUpdate();
  const listCategories = useListCategories();
  const itemCategories = useItemCategories();
  const widgetListId = useWidgetListId();

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

      <h3>Thème</h3>
      <ThemePicker />

      <h3>Widget</h3>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontSize: 12, color: 'var(--md-on-surface-variant)', margin: 0 }}>
          Liste affichée sur le widget écran d'accueil.
        </p>
        <select value={widgetListId} onChange={(e) => setWidgetListId(e.target.value)}>
          <option value="">Automatique (la plus ancienne)</option>
          {(lists ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <h3>Catégories de listes</h3>
      <CategoryManager
        title="Types de liste"
        categories={listCategories.data ?? []}
        addCategory={listCategories.addCategory}
        deleteCategory={listCategories.deleteCategory}
      />

      <h3>Catégories d'articles</h3>
      <CategoryManager
        title="Catégories d'articles"
        categories={itemCategories.data ?? []}
        addCategory={itemCategories.addCategory}
        deleteCategory={itemCategories.deleteCategory}
      />

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

      <h3>Compte</h3>
      <div className="card">
        <p>Connecté en tant que {session?.user.email}</p>
        <button className="btn-text" onClick={signOut}>
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
