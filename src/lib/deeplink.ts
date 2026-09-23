export const AUTH_CALLBACK_URL = 'com.karelisio.mago://login-callback';

export function extractSessionTokensFromUrl(url: string) {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;

  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;

  return { access_token, refresh_token };
}
