import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AppUser } from '../types.js';

interface TokenPayload {
  sub: string;
  email: string;
  role: AppUser['role'];
}

export function signToken(user: AppUser) {
  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}

export type { TokenPayload };
