import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.js';

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export function requireModerator(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!['admin', 'moderator'].includes(req.user.role)) {
    res.status(403).json({ error: 'Moderator access required' });
    return;
  }
  next();
}
