import type { Request, Response, NextFunction } from 'express';
import { getSession } from '../lib/authSecurity.js';
import { platformStore } from '../store/index.js';
import { verifyToken } from '../lib/tokens.js';
import type { AppUser } from '../types.js';

export interface AuthenticatedRequest extends Request {
  user?: AppUser;
  sessionId?: string;
}

function extractToken(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }
  const sessionHeader = req.headers['x-session-token'];
  if (typeof sessionHeader === 'string' && sessionHeader.trim()) {
    return sessionHeader.trim();
  }
  return null;
}

export async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) {
      next();
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      next();
      return;
    }
    const session = payload.sid ? await getSession(payload.sid) : undefined;
    if (payload.sid && (!session || session.revokedAt)) {
      next();
      return;
    }
    const user = platformStore.getUserById(payload.sub);
    if (user) {
      req.user = platformStore.toPublicUser(user);
      req.sessionId = payload.sid;
    }
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired session' });
      return;
    }
    if (payload.sid) {
      const session = await getSession(payload.sid);
      if (!session || session.revokedAt) {
        res.status(401).json({ error: 'Session revoked' });
        return;
      }
      req.sessionId = payload.sid;
    }
    const user = platformStore.getUserById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    req.user = platformStore.toPublicUser(user);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireSeller(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'seller' && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Seller access required' });
    return;
  }
  next();
}

/** Blocks checkout/listing publish when email is unverified (respects platform setting). */
export async function requireVerifiedEmail(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const { isFeatureEnabled } = await import('../lib/platformSettings.js');
    const required = await isFeatureEnabled('require_email_verification', true);
    if (!required) {
      next();
      return;
    }
    const stored = platformStore.getUserById(req.user.id);
    // Demo/legacy accounts often set `verified` without the newer emailVerified flag.
    const ok = Boolean(stored?.emailVerified || stored?.verified || req.user.verified);
    if (!ok) {
      res.status(403).json({
        error: 'Email verification required',
        code: 'EMAIL_VERIFICATION_REQUIRED',
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
