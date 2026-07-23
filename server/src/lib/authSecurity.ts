import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createId } from './ids.js';
import { logger, recordSecurityEvent } from './security.js';

export type AuthTokenType = 'email_verify' | 'password_reset' | 'mobile_verify';

export interface SessionRecord {
  id: string;
  userId: string;
  refreshTokenHash: string;
  replacedBy?: string;
  revokedAt?: string;
  expiresAt: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
}

export interface AuthTokenRecord {
  id: string;
  userId: string;
  type: AuthTokenType;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface LoginAttemptState {
  failures: number;
  lockedUntil?: number;
  lastFailureAt?: number;
}

const sessions = new Map<string, SessionRecord>();
const authTokens = new Map<string, AuthTokenRecord>();
const loginAttempts = new Map<string, LoginAttemptState>();
const outbox: Array<{ to: string; subject: string; body: string; sentAt: string }> = [];

const COMMON_COMPROMISED = new Set(
  [
    'password',
    'password1',
    'password123',
    '12345678',
    '123456789',
    'qwerty123',
    'demo1234',
    'letmein',
    'welcome1',
    'admin123',
    'iloveyou',
    'monkey123',
    'dragon123',
    'master123',
    'login1234',
    'abc12345',
    'passw0rd',
  ].map((value) => value.toLowerCase())
);

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOpaqueToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function tokensEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function assertNotCompromisedPassword(password: string) {
  if (COMMON_COMPROMISED.has(password.toLowerCase())) {
    throw new Error('This password appears in known compromised-password lists. Choose another.');
  }

  // Optional HIBP k-anonymity check when network is available.
  try {
    const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return;
    const body = await response.text();
    const hit = body.split('\n').some((line) => line.startsWith(suffix));
    if (hit) {
      throw new Error('This password appears in known compromised-password lists. Choose another.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('compromised-password')) {
      throw error;
    }
    // Network failures should not block signup in offline/dev environments.
  }
}

export function getLockoutState(email: string) {
  return loginAttempts.get(email.trim().toLowerCase());
}

export function assertNotLocked(email: string) {
  const state = getLockoutState(email);
  if (state?.lockedUntil && state.lockedUntil > Date.now()) {
    const seconds = Math.ceil((state.lockedUntil - Date.now()) / 1000);
    throw new Error(`Account temporarily locked. Try again in ${seconds} seconds.`);
  }
}

export function recordLoginFailure(email: string) {
  const key = email.trim().toLowerCase();
  const current = loginAttempts.get(key) ?? { failures: 0 };
  const failures = current.failures + 1;
  const delayMs =
    process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
      ? 200
      : Math.min(60_000, 1000 * 2 ** Math.min(failures - 1, 5));
  const next: LoginAttemptState = {
    failures,
    lastFailureAt: Date.now(),
    lockedUntil: failures >= 5 ? Date.now() + delayMs : undefined,
  };
  loginAttempts.set(key, next);
  return next;
}

export function clearLoginFailures(email: string) {
  loginAttempts.delete(email.trim().toLowerCase());
}

export function progressiveDelayMs(email: string) {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return 0;
  }
  const state = getLockoutState(email);
  if (!state?.failures) return 0;
  return Math.min(5_000, 250 * 2 ** Math.min(state.failures - 1, 4));
}

export function createSession(input: {
  userId: string;
  userAgent?: string;
  ip?: string;
  ttlDays?: number;
}) {
  const refreshToken = generateOpaqueToken();
  const id = createId('sess');
  const ttlDays = input.ttlDays ?? 14;
  const record: SessionRecord = {
    id,
    userId: input.userId,
    refreshTokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString(),
    userAgent: input.userAgent,
    ip: input.ip,
    createdAt: new Date().toISOString(),
  };
  sessions.set(id, record);
  return { session: record, refreshToken };
}

export function getSession(sessionId: string) {
  return sessions.get(sessionId);
}

export function listUserSessions(userId: string) {
  return Array.from(sessions.values()).filter(
    (session) => session.userId === userId && !session.revokedAt
  );
}

export function revokeSession(sessionId: string, reason = 'revoked') {
  const session = sessions.get(sessionId);
  if (!session || session.revokedAt) return session;
  session.revokedAt = new Date().toISOString();
  recordSecurityEvent('session.revoked', {
    actorId: session.userId,
    targetId: sessionId,
    detail: { reason },
  });
  return session;
}

export function revokeAllUserSessions(userId: string, reason = 'logout_all') {
  const affected = listUserSessions(userId);
  affected.forEach((session) => revokeSession(session.id, reason));
  return affected.length;
}

export function rotateRefreshToken(sessionId: string, presentedRefreshToken: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Invalid refresh token');
  }
  if (session.revokedAt || new Date(session.expiresAt).getTime() < Date.now()) {
    throw new Error('Session expired');
  }

  const presentedHash = hashToken(presentedRefreshToken);
  if (!tokensEqual(presentedHash, session.refreshTokenHash)) {
    // Reuse detection: revoke the whole family.
    revokeAllUserSessions(session.userId, 'refresh_reuse_detected');
    recordSecurityEvent('session.refresh_reuse', {
      actorId: session.userId,
      targetId: sessionId,
    });
    throw new Error('Refresh token reuse detected. All sessions revoked.');
  }

  const nextRefresh = generateOpaqueToken();
  const replacement = createSession({
    userId: session.userId,
    userAgent: session.userAgent,
    ip: session.ip,
  });
  session.revokedAt = new Date().toISOString();
  session.replacedBy = replacement.session.id;
  return {
    session: replacement.session,
    refreshToken: replacement.refreshToken,
    previousSessionId: sessionId,
    nextRefresh,
  };
}

export function createAuthToken(userId: string, type: AuthTokenType, ttlMinutes: number) {
  const raw = generateOpaqueToken();
  const record: AuthTokenRecord = {
    id: createId('atok'),
    userId,
    type,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  authTokens.set(record.id, record);
  return { record, rawToken: raw };
}

export function consumeAuthToken(rawToken: string, type: AuthTokenType) {
  const hash = hashToken(rawToken);
  const record = Array.from(authTokens.values()).find(
    (item) => item.type === type && !item.usedAt && tokensEqual(item.tokenHash, hash)
  );
  if (!record) {
    throw new Error('Invalid or expired token');
  }
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    throw new Error('Invalid or expired token');
  }
  record.usedAt = new Date().toISOString();
  return record;
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  body: string;
}) {
  const entry = { ...input, sentAt: new Date().toISOString() };
  outbox.push(entry);
  // Dev/test adapter: log only. Replace with SES/Postmark/Resend in production.
  logger.info('Transactional email queued', { to: input.to, subject: input.subject });
  if (process.env.TRANSACTIONAL_EMAIL_WEBHOOK) {
    try {
      await fetch(process.env.TRANSACTIONAL_EMAIL_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch {
      logger.warn('Transactional email webhook failed', { to: input.to });
    }
  }
  return entry;
}

export function listEmailOutbox() {
  return [...outbox];
}

export function resetAuthSecurityStateForTests() {
  sessions.clear();
  authTokens.clear();
  loginAttempts.clear();
  outbox.length = 0;
}
