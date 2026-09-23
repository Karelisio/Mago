import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { PushToken } from '../lib/pushToken';

// Enregistre le token FCM de l'appareil dans device_tokens dès qu'une
// session est active, pour que l'Edge Function puisse pousser une notif au
// widget (Phase 5). Best-effort : une erreur ici (Firebase pas encore
// configuré, pas de réseau, etc.) ne doit jamais empêcher l'app de
// fonctionner normalement.
export function usePushRegistration() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session || !Capacitor.isNativePlatform()) return;

    let cancelled = false;

    async function register() {
      try {
        // Si MagoFcmService a reçu un nouveau token pendant que l'app était
        // fermée, il a été mis de côté nativement (pas de session JS à qui
        // le donner sur le moment) : on le récupère et on l'efface d'abord.
        const pending = await PushToken.getPendingToken();
        if (pending.token) {
          await PushToken.clearPendingToken();
        }

        const { token } = pending.token ? { token: pending.token } : await PushToken.getFcmToken();
        if (cancelled || !session) return;

        await supabase
          .from('device_tokens')
          .upsert(
            { user_id: session.user.id, fcm_token: token, platform: 'android' },
            { onConflict: 'user_id,fcm_token' },
          );
      } catch {
        // Best-effort, voir commentaire plus haut.
      }
    }

    void register();

    return () => {
      cancelled = true;
    };
  }, [session]);
}
