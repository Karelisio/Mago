import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { AUTH_CALLBACK_URL, isPendingLoginFresh, parseAuthCallbackUrl, type AuthCallback } from '../lib/deeplink';
import { createLinkGate, linkKey, rememberLink } from '../lib/handledLinks';
import { getLocalPref, PENDING_LOGIN_KEY, setLocalPref } from '../lib/localPref';
import { clearQueue } from '../lib/offlineQueue';
import { PushToken } from '../lib/pushToken';
import { WidgetBridge } from '../lib/widgetBridge';
import { setWidgetListId } from '../hooks/useWidgetListPref';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
  // Échec d'un lien de connexion ouvert dans l'app (affiché par Login).
  linkError: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOGIN_LINK_ERROR =
  'Ce lien de connexion ne fonctionne pas ici : il a expiré, a déjà servi, ou a été ouvert sur un autre appareil ' +
  'que celui qui l’a demandé. Demande un nouveau lien depuis ce téléphone.';

// Retour du lien magique (deep link com.karelisio.mago://login-callback).
// Jamais de setSession() avec des jetons lus dans l'URL : un lien forgé
// pouvait connecter le téléphone au compte de quelqu'un d'autre.
async function completeLogin(callback: AuthCallback): Promise<boolean> {
  try {
    if (callback.code) {
      // PKCE : échoue sans le code_verifier gardé par supabase-js sur
      // l'appareil qui a demandé le lien (lien ouvert ailleurs, ou déjà servi).
      const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
      if (error) console.warn('Lien de connexion refusé', error);
      return !error;
    }
    if (callback.tokenHash && callback.otpType && isPendingLoginFresh(getLocalPref(PENDING_LOGIN_KEY), Date.now())) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: callback.tokenHash, type: callback.otpType });
      if (error) console.warn('Lien de connexion refusé', error);
      return !error;
    }
  } catch (err) {
    console.warn('Lien de connexion refusé', err);
  }
  // Erreur renvoyée par Supabase, jetons bruts, token_hash sans demande
  // récente depuis ce téléphone, ou lien incomplet.
  if (callback.error) console.warn('Lien de connexion refusé', callback.error);
  return false;
}

const TOKEN_CLEANUP_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('délai dépassé')), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Ligne device_tokens de CET appareil pour le compte qui se déconnecte :
// sans ça, les push de ses listes partagées continuent d'arriver ici.
// Best-effort et borné dans le temps (hors ligne, Firebase indisponible) :
// l'Edge Function purge de toute façon un jeton devenu invalide, et le
// widget ignore les push après une déconnexion (clearSnapshot).
async function forgetDeviceToken(userId: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { token } = await withTimeout(PushToken.getFcmToken(), TOKEN_CLEANUP_TIMEOUT_MS);
    await withTimeout(
      supabase.from('device_tokens').delete().eq('user_id', userId).eq('fcm_token', token),
      TOKEN_CLEANUP_TIMEOUT_MS,
    );
  } catch {
    // Voir plus haut.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Lien de connexion ouvert dans l'app : appUrlOpen (app déjà ouverte) ET
  // getLaunchUrl() (démarrage à froid — l'appUrlOpen retenu par Capacitor
  // n'est livré qu'au premier listener abonné, celui d'ImportContext). Les
  // URL d'import sont ignorées ici (et inversement dans ImportContext). Un
  // lien déjà traité relivré au lancement (rejeu de l'intent, voir
  // handledLinks.ts) est ignoré, sans message d'erreur.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const shouldIgnore = createLinkGate();

    async function receive(url: string, fromLaunch: boolean) {
      const callback = parseAuthCallbackUrl(url);
      if (!callback || (await shouldIgnore(url, fromLaunch))) return;
      await rememberLink(linkKey(url)).catch(() => undefined);
      // Déjà connecté·e (lien rouvert) : rien à faire.
      const { data } = await supabase.auth.getSession();
      if (data.session) return;
      if (await completeLogin(callback)) {
        setLocalPref(PENDING_LOGIN_KEY, '');
        setLinkError(null);
      } else {
        setLinkError(LOGIN_LINK_ERROR);
      }
    }

    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) void receive(launch.url, true);
    });
    const listenerPromise = App.addListener('appUrlOpen', ({ url }) => void receive(url, false));
    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  async function signInWithMagicLink(email: string) {
    setLinkError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: Capacitor.isNativePlatform() ? AUTH_CALLBACK_URL : window.location.origin,
      },
    });
    if (!error) setLocalPref(PENDING_LOGIN_KEY, JSON.stringify({ at: Date.now() }));
    return { error: error?.message ?? null };
  }

  // Déconnexion propre de CET appareil (Réglages, après envoi de la file) :
  // rien du compte ne doit rester pour le suivant — jeton FCM, file de sync
  // (écrite avec son last_modified_by, rejetée ensuite par RLS), cache
  // React Query (['lists'] n'a pas d'id d'utilisateur : le compte suivant
  // voyait les anciennes listes jusqu'à 30 s), aperçu et liste du widget.
  async function signOut(): Promise<{ error: string | null }> {
    const { data: before } = await supabase.auth.getSession();
    const userId = before.session?.user.id;
    if (userId) await forgetDeviceToken(userId);
    // scope local : les autres appareils du compte restent connectés. Hors
    // ligne, supabase-js renvoie une erreur mais retire quand même la
    // session locale : on nettoie dès qu'elle a disparu.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    // Session encore là — ou jeton expiré impossible à rafraîchir hors ligne
    // (getSession renvoie alors une erreur, la session reste stockée) : on ne
    // nettoie rien, l'utilisateur reste connecté et peut réessayer.
    const { data: after, error: afterError } = await supabase.auth.getSession();
    if (after.session || afterError) {
      return { error: `Déconnexion impossible${error ? ` : ${error.message}` : ''}. Réessaie avec une connexion.` };
    }
    await clearQueue().catch(() => undefined);
    queryClient.clear();
    setWidgetListId('');
    if (Capacitor.isNativePlatform()) {
      await WidgetBridge.clearSnapshot().catch(() => undefined);
    }
    return { error: null };
  }

  return (
    <AuthContext.Provider value={{ session, loading, signInWithMagicLink, signOut, linkError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
}
