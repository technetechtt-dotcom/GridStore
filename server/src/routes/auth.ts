import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { platformStore } from '../store/index.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z
    .enum(['buyer', 'seller', 'moderator', 'admin'])
    .optional()
    .catch(undefined),
});

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['buyer', 'seller', 'moderator', 'admin']).optional(),
});

const profileSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

const oauthSchema = z.object({
  provider: z.enum(['google', 'github']),
  role: z.enum(['buyer', 'seller', 'moderator', 'admin']).optional(),
});

const resetSchema = z.object({
  email: z.string().email(),
});

function handleAuthError(res: import('express').Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'Authentication failed';
  const status = message.includes('already exists') || message.includes('Invalid') ? 400 : 400;
  res.status(status).json({ error: message });
}

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid login payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await platformStore.login(
      parsed.data.email,
      parsed.data.password,
      parsed.data.role ?? 'buyer'
    );
    res.json({ user });
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid signup payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await platformStore.signup(
      parsed.data.name,
      parsed.data.email,
      parsed.data.password,
      parsed.data.role ?? 'buyer'
    );
    res.status(201).json({ user });
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.post('/oauth', async (req, res) => {
  const parsed = oauthSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid OAuth payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await platformStore.oauthLogin(parsed.data.provider, parsed.data.role ?? 'buyer');
    res.json({ user });
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.post('/password-reset', (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid email', details: parsed.error.flatten() });
    return;
  }

  res.json({
    message: `Password reset link prepared for ${parsed.data.email}. Connect your mail provider to deliver it.`,
  });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: { ...req.user, sessionToken: extractSessionToken(req) } });
});

authRouter.patch('/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid profile payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const user = await platformStore.updateProfile(req.user!.id, parsed.data);
    res.json({
      user: {
        ...user,
        sessionToken: extractSessionToken(req),
      },
    });
  } catch (error) {
    handleAuthError(res, error);
  }
});

authRouter.post('/logout', requireAuth, (_req, res) => {
  res.json({ message: 'Logged out' });
});

function extractSessionToken(req: AuthenticatedRequest) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }
  const sessionHeader = req.headers['x-session-token'];
  return typeof sessionHeader === 'string' ? sessionHeader : undefined;
}
