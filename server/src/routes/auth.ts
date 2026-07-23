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
import { platformStore } from '../store/index.js';

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

function handleAuthError(res: import('express').Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'Authentication failed';
  res.status(400).json({ error: message });
}

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid login payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await platformStore.login(parsed.data.email, parsed.data.password);
    recordSecurityEvent('auth.login.success', {
      actorId: user.id,
      ip: req.ip,
      requestId: req.requestId,
    });
    res.json({ user });
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
    res.status(201).json({ user });
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
    const user = await platformStore.oauthLogin(parsed.data.provider);
    res.json({ user });
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.post('/password-reset', authLimiter, (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email', details: parsed.error.flatten() });
    return;
  }

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

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const stored = platformStore.getUserById(req.user!.id);
  res.json({
    user: {
      ...req.user,
      mustChangePassword: Boolean(stored?.mustChangePassword),
      mfaEnabled: Boolean(stored?.mfaEnabled),
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
    const user = await platformStore.updateProfile(req.user!.id, parsed.data);
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

authRouter.post('/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  recordSecurityEvent('auth.logout', {
    actorId: req.user?.id,
    ip: req.ip,
    requestId: req.requestId,
  });
  res.json({ message: 'Logged out' });
});
