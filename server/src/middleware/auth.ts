import type { Request, Response, NextFunction } from 'express';
import { platformStore } from '../store/index.js';
import { verifyToken } from '../lib/tokens.js';
import type { AppUser } from '../types.js';

export interface AuthenticatedRequest extends Request {
  user?: AppUser;
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

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
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
  const user = platformStore.getUserById(payload.sub);
  if (user) {
    req.user = platformStore.toPublicUser(user);
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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
  const user = platformStore.getUserById(payload.sub);
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }
  req.user = platformStore.toPublicUser(user);
  next();
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
