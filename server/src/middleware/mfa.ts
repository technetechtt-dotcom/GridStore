import type { NextFunction, Response } from 'express';
import { env } from '../config/env.js';
import { recordSecurityEvent } from '../lib/security.js';
import { platformStore } from '../store/index.js';
import type { AuthenticatedRequest } from './auth.js';

function privilegedMfaEnforced() {
  return env.isProduction || process.env.REQUIRE_MFA === 'true';
}

export function requirePrivilegedMfa(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!['admin', 'moderator'].includes(req.user.role)) {
    next();
    return;
  }

  if (!privilegedMfaEnforced()) {
    next();
    return;
  }

  const stored = platformStore.getUserById(req.user.id);
  if (!stored) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  const tokenHeader = req.headers['x-mfa-token'];
  const token = typeof tokenHeader === 'string' ? tokenHeader : undefined;
  if (!platformStore.isMfaSatisfied(stored, token)) {
    recordSecurityEvent('auth.mfa.required', {
      actorId: req.user.id,
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(403).json({
      error: 'MFA required for privileged access',
      code: 'MFA_REQUIRED',
    });
    return;
  }

  next();
}
