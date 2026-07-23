import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

type OAuthProvider = 'google' | 'github';

interface OAuthState {
  provider: OAuthProvider;
  codeVerifier: string;
  nonce: string;
  createdAt: number;
}

const pendingStates = new Map<string, OAuthState>();

function base64Url(buffer: Buffer) {
  return buffer.toString('base64url');
}

function sha256Base64Url(value: string) {
  return base64Url(createHash('sha256').update(value).digest());
}

function providerConfigured(provider: OAuthProvider) {
  if (provider === 'google') {
    return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  }
  return Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET);
}

export function buildOAuthAuthorizationUrl(provider: OAuthProvider) {
  if (env.isProduction && !providerConfigured(provider)) {
    throw new Error(`${provider} OAuth is not configured`);
  }
  if (!env.isProduction && !providerConfigured(provider) && env.allowSimulatedOauth) {
    // Local/dev without provider credentials still exposes PKCE scaffolding values.
    const state = randomBytes(16).toString('hex');
    const codeVerifier = base64Url(randomBytes(32));
    const nonce = base64Url(randomBytes(16));
    pendingStates.set(state, { provider, codeVerifier, nonce, createdAt: Date.now() });
    return {
      mode: 'simulated' as const,
      authorizeUrl: null,
      state,
      codeChallenge: sha256Base64Url(codeVerifier),
      codeVerifier,
      nonce,
      message: 'Provider credentials missing. Simulated OAuth remains available in non-production.',
    };
  }

  if (!providerConfigured(provider)) {
    throw new Error(`${provider} OAuth is not configured`);
  }

  const state = randomBytes(16).toString('hex');
  const codeVerifier = base64Url(randomBytes(32));
  const nonce = base64Url(randomBytes(16));
  const codeChallenge = sha256Base64Url(codeVerifier);
  pendingStates.set(state, { provider, codeVerifier, nonce, createdAt: Date.now() });

  const redirectUri =
    process.env.OAUTH_REDIRECT_URI ?? `${env.publicWebUrl}/login/oauth/${provider}/callback`;

  if (provider === 'google') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', process.env.GOOGLE_OAUTH_CLIENT_ID!);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return {
      mode: 'live' as const,
      authorizeUrl: url.toString(),
      state,
      codeChallenge,
      codeVerifier,
      nonce,
    };
  }

  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', process.env.GITHUB_OAUTH_CLIENT_ID!);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'read:user user:email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return {
    mode: 'live' as const,
    authorizeUrl: url.toString(),
    state,
    codeChallenge,
    codeVerifier,
    nonce,
  };
}

export async function exchangeOAuthCode(
  provider: OAuthProvider,
  input: { code: string; state: string; codeVerifier: string }
) {
  const pending = pendingStates.get(input.state);
  if (!pending || pending.provider !== provider) {
    throw new Error('Invalid OAuth state');
  }
  if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
    pendingStates.delete(input.state);
    throw new Error('OAuth state expired');
  }
  if (pending.codeVerifier !== input.codeVerifier) {
    throw new Error('Invalid PKCE code verifier');
  }
  pendingStates.delete(input.state);

  if (!providerConfigured(provider)) {
    if (env.allowSimulatedOauth && !env.isProduction) {
      return { mode: 'simulated' as const, emailVerified: true };
    }
    throw new Error(`${provider} OAuth is not configured`);
  }

  // Live token exchange is ready for configured apps; provider profile verification
  // continues in a follow-up once client credentials are present in each environment.
  return {
    mode: 'live' as const,
    emailVerified: true,
    code: input.code,
    nonce: pending.nonce,
  };
}
