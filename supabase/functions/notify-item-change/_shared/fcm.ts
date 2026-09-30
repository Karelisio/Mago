// Échange le compte de service Firebase contre un token OAuth2 (JWT-bearer
// grant, RFC 7523) via l'API Web Crypto de Deno, sans dépendance
// firebase-admin (pas adaptée à l'environnement Edge Function).

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const contents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const raw = Uint8Array.from(atob(contents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    raw,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const claims = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!res.ok) {
    throw new Error(`Échange de token OAuth2 échoué : HTTP ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

export interface FcmSendResult {
  ok: boolean;
  status: number;
  errorCode?: string;
}

// Corps d'erreur de l'API FCM v1 : le code précis (UNREGISTERED,
// QUOTA_EXCEEDED…) est dans le détail de type FcmError ; error.status n'est
// que le statut générique (NOT_FOUND, INVALID_ARGUMENT…).
interface FcmErrorBody {
  error?: {
    status?: string;
    details?: { '@type'?: string; errorCode?: string }[];
  };
}

const FCM_ERROR_TYPE = 'type.googleapis.com/google.firebase.fcm.v1.FcmError';

export async function sendFcmDataMessage(
  serviceAccount: ServiceAccount,
  projectId: string,
  token: string,
  data: Record<string, string>,
  collapseKey: string,
): Promise<FcmSendResult> {
  const accessToken = await getAccessToken(serviceAccount);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        data,
        android: { priority: 'high', collapse_key: collapseKey },
      },
    }),
  });

  if (res.ok) {
    return { ok: true, status: res.status };
  }

  const body = (await res.json().catch(() => null)) as FcmErrorBody | null;
  const details = body?.error?.details;
  const fcmError = (Array.isArray(details) ? details : []).find(
    (d) => d?.['@type'] === FCM_ERROR_TYPE && typeof d.errorCode === 'string',
  );
  return { ok: false, status: res.status, errorCode: fcmError?.errorCode ?? body?.error?.status };
}
