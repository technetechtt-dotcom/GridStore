import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config/env.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  assertPasswordPolicy,
  generateMfaSecret,
  recordSecurityEvent,
} from '../lib/security.js';
import { listEmailOutbox } from '../lib/authSecurity.js';
import { buildOAuthAuthorizationUrl, exchangeOAuthCode } from '../lib/oauth.js';
import { platformStore } from '../store/index.js';
import { verifyToken } from '../lib/tokens.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again later.' },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(10),
  mobile: z.string().min(8).optional(),
});

const profileSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

const oauthSchema = z.object({
  provider: z.enum(['google', 'github']),
});

const resetSchema = z.object({
  email: z.string().email(),
});

const resetConfirmSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(10),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
  sessionId: z.string().min(3).optional(),
});

function handleAuthError(res: import('express').Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'Authentication failed';
  res.status(400).json({ error: message });
}

function requestMeta(req: import('express').Request) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  };
}

function authResponse(user: Awaited<ReturnType<typeof platformStore.login>>) {
  const {
    accessToken,
    refreshToken,
    expiresIn,
    sessionToken: _sessionToken,
    ...safeUser
  } = user;
  return {
    user: safeUser,
    accessToken,
    refreshToken,
    expiresIn,
    // Temporary compatibility for existing clients/tests.
    sessionToken: accessToken,
  };
}

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid login payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await platformStore.login(
      parsed.data.email,
      parsed.data.password,
      requestMeta(req)
    );
    recordSecurityEvent('auth.login.success', {
      actorId: user.id,
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(authResponse(user));
  } catch (error) {
    recordSecurityEvent('auth.login.failure', {
      ip: req.ip,
      requestId: req.requestId,
      detail: { email: parsed.data.email },
    });
    handleAuthError(res, error);
  }
});

authRouter.post('/signup', authLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid signup payload', details: parsed.error.flatten() });
    return;
  }

  try {
    assertPasswordPolicy(parsed.data.password);
    const user = await platformStore.signup(
      parsed.data.name,
      parsed.data.email,
      parsed.data.password
    );
    recordSecurityEvent('auth.signup.success', {
      actorId: user.id,
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json(authResponse(user));
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.post('/oauth', authLimiter, async (req, res) => {
  if (!env.allowSimulatedOauth) {
    recordSecurityEvent('auth.oauth.blocked', { ip: req.ip, requestId: req.requestId });
    res.status(403).json({ error: 'Simulated OAuth is disabled in this environment' });
    return;
  }

  const parsed = oauthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid OAuth payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await platformStore.oauthLogin(parsed.data.provider, requestMeta(req));
    res.json(authResponse(user));
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.get('/oauth/:provider/start', authLimiter, (req, res) => {
  const provider = req.params.provider;
  if (provider !== 'google' && provider !== 'github') {
    res.status(400).json({ error: 'Unsupported OAuth provider' });
    return;
  }
  try {
    const started = buildOAuthAuthorizationUrl(provider);
    res.json(started);
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.post('/oauth/:provider/callback', authLimiter, async (req, res) => {
  const provider = req.params.provider;
  if (provider !== 'google' && provider !== 'github') {
    res.status(400).json({ error: 'Unsupported OAuth provider' });
    return;
  }
  const parsed = z
    .object({
      code: z.string().min(1),
      state: z.string().min(1),
      codeVerifier: z.string().min(10),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid OAuth callback payload' });
    return;
  }

  try {
    await exchangeOAuthCode(provider, parsed.data);
    // Until real provider apps are configured, fall back is blocked in production.
    const user = await platformStore.oauthLogin(provider, requestMeta(req));
    res.json(authResponse(user));
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.post('/password-reset', authLimiter, async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email', details: parsed.error.flatten() });
    return;
  }

  await platformStore.requestPasswordReset(parsed.data.email);
  recordSecurityEvent('auth.password_reset.requested', {
    ip: req.ip,
    requestId: req.requestId,
    detail: { email: parsed.data.email },
  });

  res.json({
    message:
      'If an account exists for that email, a password reset link will be sent when email delivery is configured.',
  });
});

authRouter.post('/password-reset/confirm', authLimiter, async (req, res) => {
  const parsed = resetConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid reset confirmation payload' });
    return;
  }

  try {
    assertPasswordPolicy(parsed.data.password);
    const user = await platformStore.confirmPasswordReset(parsed.data.token, parsed.data.password);
    recordSecurityEvent('auth.password_reset.confirmed', {
      actorId: user.id,
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json(authResponse(user));
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.post('/verify-email', authLimiter, async (req, res) => {
  const parsed = z.object({ token: z.string().min(20) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid verification token' });
    return;
  }
  try {
    const user = await platformStore.verifyEmail(parsed.data.token);
    res.json({ user });
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.post('/refresh', authLimiter, async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid refresh payload' });
    return;
  }

  try {
    const access = req.headers.authorization?.startsWith('Bearer ')
      ? verifyToken(req.headers.authorization.slice(7))
      : null;
    const sessionId = parsed.data.sessionId || access?.sid;
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId required for refresh' });
      return;
    }
    const user = await platformStore.refreshSession(sessionId, parsed.data.refreshToken);
    res.json(authResponse(user));
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const stored = platformStore.getUserById(req.user!.id);
  res.json({
    user: {
      ...req.user,
      mustChangePassword: Boolean(stored?.mustChangePassword),
      mfaEnabled: Boolean(stored?.mfaEnabled),
      emailVerified: Boolean(stored?.emailVerified),
    },
  });
});

authRouter.patch('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid profile payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const existing = platformStore.getUserById(req.user!.id);
    const emailChanged = existing && existing.email !== parsed.data.email.trim().toLowerCase();
    const user = await platformStore.updateProfile(req.user!.id, parsed.data);
    if (emailChanged) {
      await platformStore.logoutAllSessions(req.user!.id);
      recordSecurityEvent('auth.email_changed', {
        actorId: req.user!.id,
        ip: req.ip,
        requestId: req.requestId,
      });
    }
    res.json({ user });
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.post('/mfa/setup', requireAuth, async (req: AuthenticatedRequest, res) => {
  const secret = generateMfaSecret();
  await platformStore.enableMfa(req.user!.id, secret);
  recordSecurityEvent('auth.mfa.setup', {
    actorId: req.user!.id,
    ip: req.ip,
    requestId: req.requestId,
  });
  res.json({
    secret,
    message: 'Store this secret in an authenticator app, then confirm with a 6-digit code.',
  });
});

authRouter.post('/mfa/confirm', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({ token: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid MFA token' });
    return;
  }
  const ok = await platformStore.confirmMfa(req.user!.id, parsed.data.token);
  if (!ok) {
    res.status(400).json({ error: 'Invalid MFA token' });
    return;
  }
  recordSecurityEvent('auth.mfa.enabled', {
    actorId: req.user!.id,
    ip: req.ip,
    requestId: req.requestId,
  });
  res.json({ enabled: true });
});

authRouter.post('/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const payload = token ? verifyToken(token) : null;
  if (payload?.sid) {
    await platformStore.logoutSession(payload.sid);
  }
  recordSecurityEvent('auth.logout', {
    actorId: req.user?.id,
    ip: req.ip,
    requestId: req.requestId,
  });
  res.json({ message: 'Logged out' });
});

authRouter.post('/logout-all', requireAuth, async (req: AuthenticatedRequest, res) => {
  const count = await platformStore.logoutAllSessions(req.user!.id);
  recordSecurityEvent('auth.logout_all', {
    actorId: req.user!.id,
    ip: req.ip,
    requestId: req.requestId,
    detail: { sessions: count },
  });
  res.json({ message: 'Logged out of all devices', sessions: count });
});

// Dev/test helper — never expose tokens in production responses.
authRouter.get('/_test/outbox', (_req, res) => {
  if (env.isProduction) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ messages: listEmailOutbox() });
});
