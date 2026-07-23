import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AppUser } from '../types.js';

interface AccessTokenPayload {
  sub: string;
  email: string;
  role: AppUser['role'];
  sid: string;
  typ: 'access';
}

export function signAccessToken(user: AppUser, sessionId: string) {
  const payload: AccessTokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    sid: sessionId,
    typ: 'access',
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

/** @deprecated Prefer signAccessToken with session binding. */
export function signToken(user: AppUser, sessionId = `legacy-${user.id}`) {
  return signAccessToken(user, sessionId);
}

export function verifyToken(token: string): AccessTokenPayload | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AccessTokenPayload;
    if (payload.typ && payload.typ !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

export function accessTokenTtlSeconds() {
  const raw = env.jwtExpiresIn;
  if (raw.endsWith('m')) return Number(raw.slice(0, -1)) * 60;
  if (raw.endsWith('h')) return Number(raw.slice(0, -1)) * 3600;
  if (raw.endsWith('d')) return Number(raw.slice(0, -1)) * 86400;
  const asNumber = Number(raw);
  return Number.isFinite(asNumber) ? asNumber : 900;
}

export type { AccessTokenPayload as TokenPayload };
