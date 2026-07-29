import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

type OAuthProvider = 'google' | 'github';

export interface OAuthIdentity {
  provider: OAuthProvider;
  subject: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

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

async function fetchGoogleIdentity(accessToken: string, idToken?: string): Promise<OAuthIdentity> {
  if (idToken) {
    const parts = idToken.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
      };
      if (payload.sub && payload.email) {
        return {
          provider: 'google',
          subject: payload.sub,
          email: payload.email.toLowerCase(),
          emailVerified: Boolean(payload.email_verified),
          name: payload.name,
        };
      }
    }
  }

  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error('Unable to fetch Google profile');
  const profile = (await response.json()) as {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
  };
  return {
    provider: 'google',
    subject: profile.sub,
    email: profile.email.toLowerCase(),
    emailVerified: Boolean(profile.email_verified),
    name: profile.name,
  };
}

async function fetchGithubIdentity(accessToken: string): Promise<OAuthIdentity> {
  const profileResponse = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'GridStore',
    },
  });
  if (!profileResponse.ok) throw new Error('Unable to fetch GitHub profile');
  const profile = (await profileResponse.json()) as { id: number; email?: string | null; name?: string; login: string };

  let email = profile.email ?? undefined;
  let emailVerified = false;
  const emailsResponse = await fetch('https://api.github.com/user/emails', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'GridStore',
    },
  });
  if (emailsResponse.ok) {
    const emails = (await emailsResponse.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const primary = emails.find((item) => item.primary && item.verified) ?? emails.find((item) => item.verified);
    if (primary) {
      email = primary.email;
      emailVerified = primary.verified;
    }
  }

  if (!email) {
    throw new Error('GitHub account has no verified email');
  }

  return {
    provider: 'github',
    subject: String(profile.id),
    email: email.toLowerCase(),
    emailVerified,
    name: profile.name || profile.login,
  };
}

export async function exchangeOAuthCode(
  provider: OAuthProvider,
  input: { code: string; state: string; codeVerifier: string }
): Promise<{ mode: 'simulated' | 'live'; identity: OAuthIdentity }> {
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
      return {
        mode: 'simulated',
        identity: {
          provider,
          subject: `sim-${provider}-${input.code.slice(0, 12)}`,
          email: `${provider}.user@gridstore.local`,
          emailVerified: true,
          name: `${provider === 'google' ? 'Google' : 'GitHub'} User`,
        },
      };
    }
    throw new Error(`${provider} OAuth is not configured`);
  }

  const redirectUri =
    process.env.OAUTH_REDIRECT_URI ?? `${env.publicWebUrl}/login/oauth/${provider}/callback`;

  if (provider === 'google') {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        code: input.code,
        code_verifier: input.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenResponse.ok) throw new Error('Google token exchange failed');
    const tokens = (await tokenResponse.json()) as { access_token: string; id_token?: string };
    const identity = await fetchGoogleIdentity(tokens.access_token, tokens.id_token);
    return { mode: 'live', identity };
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_OAUTH_CLIENT_ID,
      client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
      code: input.code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) throw new Error('GitHub token exchange failed');
  const tokens = (await tokenResponse.json()) as { access_token?: string; error?: string };
  if (!tokens.access_token) throw new Error(tokens.error || 'GitHub token exchange failed');
  const identity = await fetchGithubIdentity(tokens.access_token);
  return { mode: 'live', identity };
}
