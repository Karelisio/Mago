import { describe, expect, it } from 'vitest';
import { AUTH_CALLBACK_URL, isPendingLoginFresh, parseAuthCallbackUrl, PENDING_LOGIN_MAX_AGE_MS } from './deeplink';

describe('parseAuthCallbackUrl', () => {
  it('ignore les URL qui ne sont pas un retour de connexion', () => {
    expect(parseAuthCallbackUrl('mago://import?data=abc')).toBeNull();
    expect(parseAuthCallbackUrl('https://example.com/?code=abc')).toBeNull();
    expect(parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}-bis?code=abc`)).toBeNull();
  });

  it('lit le code PKCE', () => {
    expect(parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}?code=0c1d2e`)).toMatchObject({
      code: '0c1d2e',
      tokenHash: null,
      error: null,
      hasRawTokens: false,
    });
    expect(parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}/?code=abc#`)?.code).toBe('abc');
  });

  it('lit token_hash et un type de connexion, refuse les autres types', () => {
    expect(parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}?token_hash=h1&type=email`)).toMatchObject({
      tokenHash: 'h1',
      otpType: 'email',
    });
    expect(parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}?token_hash=h1`)?.otpType).toBe('email');
    expect(parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}?token_hash=h1&type=signup`)?.otpType).toBe('signup');
    expect(parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}?token_hash=h1&type=recovery`)?.otpType).toBeNull();
  });

  it('remonte une erreur Supabase, dans la query ou le fragment', () => {
    expect(
      parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`)
        ?.error,
    ).toBe('Email link is invalid or has expired');
    expect(parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}?error=access_denied&error_code=otp_expired`)?.error).toBe('otp_expired');
  });

  it('repère les jetons bruts (ancien flux implicite), jamais acceptés', () => {
    const cb = parseAuthCallbackUrl(`${AUTH_CALLBACK_URL}#access_token=a&refresh_token=r&token_type=bearer`);
    expect(cb).toMatchObject({ hasRawTokens: true, code: null, tokenHash: null });
  });
});

describe('isPendingLoginFresh', () => {
  const now = 1_800_000_000_000;
  it('accepte un lien demandé depuis moins d’une heure', () => {
    expect(isPendingLoginFresh(JSON.stringify({ at: now - 5 * 60 * 1000 }), now)).toBe(true);
  });
  it('refuse un marqueur absent, illisible, trop vieux ou dans le futur', () => {
    expect(isPendingLoginFresh('', now)).toBe(false);
    expect(isPendingLoginFresh('{oops', now)).toBe(false);
    expect(isPendingLoginFresh(JSON.stringify({ at: 'hier' }), now)).toBe(false);
    expect(isPendingLoginFresh(JSON.stringify({ at: now - PENDING_LOGIN_MAX_AGE_MS }), now)).toBe(false);
    expect(isPendingLoginFresh(JSON.stringify({ at: now + 60_000 }), now)).toBe(false);
  });
});
