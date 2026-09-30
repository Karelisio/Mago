import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { AUTH_CALLBACK_URL, extractSessionTokensFromUrl } from '../lib/deeplink';
import { clearQueue } from '../lib/offlineQueue';
import { PushToken } from '../lib/pushToken';
import { WidgetBridge } from '../lib/widgetBridge';
import { setWidgetListId } from '../hooks/useWidgetListPref';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listenerPromise = App.addListener('appUrlOpen', ({ url }) => {
      const tokens = extractSessionTokensFromUrl(url);
      if (tokens) {
        void supabase.auth.setSession(tokens);
      }
    });

    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, []);

  async function signInWithMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: Capacitor.isNativePlatform() ? AUTH_CALLBACK_URL : window.location.origin,
      },
    });
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
    const { data: after } = await supabase.auth.getSession();
    if (after.session) {
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
    <AuthContext.Provider value={{ session, loading, signInWithMagicLink, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
}
