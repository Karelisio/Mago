import type { EmailOtpType } from '@supabase/supabase-js';

export const AUTH_CALLBACK_URL = 'com.karelisio.mago://login-callback';

// Lien de connexion demandé depuis CET appareil il y a moins d'une heure
// (marqueur { at } posé par signInWithMagicLink) : seule condition pour
// accepter un token_hash reçu par deep link.
export const PENDING_LOGIN_MAX_AGE_MS = 60 * 60 * 1000;

// Types d'OTP e-mail d'une connexion par lien magique (signup : premier
// lien d'un nouveau compte).
const LOGIN_OTP_TYPES: EmailOtpType[] = ['email', 'magiclink', 'signup'];

export interface AuthCallback {
  // Flux PKCE (lien standard {{ .ConfirmationURL }}) : échangé contre une
  // session avec le code_verifier gardé par supabase-js sur cet appareil.
  code: string | null;
  // Lien direct vers l'app ({{ .RedirectTo }}?token_hash=…&type=…).
  tokenHash: string | null;
  otpType: EmailOtpType | null;
  // Erreur renvoyée par Supabase (lien expiré, déjà utilisé…).
  error: string | null;
  // access_token/refresh_token en clair dans l'URL (ancien flux implicite) :
  // plus jamais acceptés — n'importe quelle app ou page pouvait ouvrir ce
  // lien avec les jetons d'un autre compte (injection de session).
  hasRawTokens: boolean;
}

// null si l'URL n'est pas un retour de connexion (ex. mago://import, traité
// par ImportContext). Paramètres lus dans la query et le fragment : Supabase
// y place les erreurs selon le flux.
export function parseAuthCallbackUrl(url: string): AuthCallback | null {
  if (!url.startsWith(AUTH_CALLBACK_URL)) return null;
  const rest = url.slice(AUTH_CALLBACK_URL.length);
  if (rest !== '' && !/^[/?#]/.test(rest)) return null;

  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  const params = new URLSearchParams(queryIndex === -1 ? '' : beforeHash.slice(queryIndex + 1));
  const fragment = new URLSearchParams(hashIndex === -1 ? '' : url.slice(hashIndex + 1));
  const get = (name: string) => params.get(name) || fragment.get(name) || null;

  const type = get('type') ?? 'email';
  return {
    code: get('code'),
    tokenHash: get('token_hash'),
    otpType: LOGIN_OTP_TYPES.includes(type as EmailOtpType) ? (type as EmailOtpType) : null,
    error: get('error_description') ?? get('error_code') ?? get('error'),
    hasRawTokens: get('access_token') !== null || get('refresh_token') !== null,
  };
}

export function isPendingLoginFresh(raw: string, now: number): boolean {
  try {
    const at: unknown = JSON.parse(raw)?.at;
    return typeof at === 'number' && at <= now && now - at < PENDING_LOGIN_MAX_AGE_MS;
  } catch {
    return false;
  }
}
