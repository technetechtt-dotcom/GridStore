import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hasDatabase, requireSql } from '../db/client.js';
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
  }
}

function rowToSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    refreshTokenHash: String(row.refresh_token_hash),
    replacedBy: row.replaced_by ? String(row.replaced_by) : undefined,
    revokedAt: row.revoked_at ? String(row.revoked_at) : undefined,
    expiresAt: String(row.expires_at),
    userAgent: row.user_agent ? String(row.user_agent) : undefined,
    ip: row.ip ? String(row.ip) : undefined,
    createdAt: String(row.created_at),
  };
}

async function persistSession(session: SessionRecord) {
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_sessions (
      id, user_id, refresh_token_hash, replaced_by, revoked_at, expires_at, user_agent, ip, created_at
    ) VALUES (
      ${session.id}, ${session.userId}, ${session.refreshTokenHash}, ${session.replacedBy ?? null},
      ${session.revokedAt ?? null}, ${session.expiresAt}, ${session.userAgent ?? null},
      ${session.ip ?? null}, ${session.createdAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      refresh_token_hash = EXCLUDED.refresh_token_hash,
      replaced_by = EXCLUDED.replaced_by,
      revoked_at = EXCLUDED.revoked_at,
      expires_at = EXCLUDED.expires_at
  `;
}

async function persistAuthToken(record: AuthTokenRecord) {
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_auth_tokens (
      id, user_id, type, token_hash, expires_at, used_at, created_at
    ) VALUES (
      ${record.id}, ${record.userId}, ${record.type}, ${record.tokenHash},
      ${record.expiresAt}, ${record.usedAt ?? null}, ${record.createdAt}
    )
    ON CONFLICT (id) DO UPDATE SET used_at = EXCLUDED.used_at
  `;
}

async function persistLoginAttempt(email: string, state: LoginAttemptState) {
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_login_attempts (email, failures, locked_until, last_failure_at, updated_at)
    VALUES (
      ${email},
      ${state.failures},
      ${state.lockedUntil ? new Date(state.lockedUntil).toISOString() : null},
      ${state.lastFailureAt ? new Date(state.lastFailureAt).toISOString() : null},
      NOW()
    )
    ON CONFLICT (email) DO UPDATE SET
      failures = EXCLUDED.failures,
      locked_until = EXCLUDED.locked_until,
      last_failure_at = EXCLUDED.last_failure_at,
      updated_at = NOW()
  `;
}

export async function getLockoutState(email: string) {
  const key = email.trim().toLowerCase();
  const cached = loginAttempts.get(key);
  if (cached) return cached;
  if (!hasDatabase()) return undefined;
  const db = requireSql();
  const rows = (await db`
    SELECT * FROM gridstore_login_attempts WHERE email = ${key} LIMIT 1
  `) as Array<{ failures: number; locked_until: string | null; last_failure_at: string | null }>;
  if (!rows[0]) return undefined;
  const state: LoginAttemptState = {
    failures: Number(rows[0].failures),
    lockedUntil: rows[0].locked_until ? new Date(rows[0].locked_until).getTime() : undefined,
    lastFailureAt: rows[0].last_failure_at ? new Date(rows[0].last_failure_at).getTime() : undefined,
  };
  loginAttempts.set(key, state);
  return state;
}

export async function assertNotLocked(email: string) {
  const state = await getLockoutState(email);
  if (state?.lockedUntil && state.lockedUntil > Date.now()) {
    const seconds = Math.ceil((state.lockedUntil - Date.now()) / 1000);
    throw new Error(`Account temporarily locked. Try again in ${seconds} seconds.`);
  }
}

export async function recordLoginFailure(email: string) {
  const key = email.trim().toLowerCase();
  const current = (await getLockoutState(key)) ?? { failures: 0 };
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
  await persistLoginAttempt(key, next);
  return next;
}

export async function clearLoginFailures(email: string) {
  const key = email.trim().toLowerCase();
  loginAttempts.delete(key);
  if (hasDatabase()) {
    const db = requireSql();
    await db`DELETE FROM gridstore_login_attempts WHERE email = ${key}`;
  }
}

export async function progressiveDelayMs(email: string) {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return 0;
  }
  const state = await getLockoutState(email);
  if (!state?.failures) return 0;
  return Math.min(5_000, 250 * 2 ** Math.min(state.failures - 1, 4));
}

export async function createSession(input: {
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
  await persistSession(record);
  return { session: record, refreshToken };
}

export async function getSession(sessionId: string) {
  const cached = sessions.get(sessionId);
  if (cached) return cached;
  if (!hasDatabase()) return undefined;
  const db = requireSql();
  const rows = (await db`
    SELECT * FROM gridstore_sessions WHERE id = ${sessionId} LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return undefined;
  const session = rowToSession(rows[0]);
  sessions.set(session.id, session);
  return session;
}

export async function listUserSessions(userId: string) {
  if (hasDatabase()) {
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_sessions
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `) as Record<string, unknown>[];
    return rows.map((row) => {
      const session = rowToSession(row);
      sessions.set(session.id, session);
      return session;
    });
  }
  return Array.from(sessions.values()).filter(
    (session) => session.userId === userId && !session.revokedAt
  );
}

export async function revokeSession(sessionId: string, reason = 'revoked') {
  const session = await getSession(sessionId);
  if (!session || session.revokedAt) return session;
  session.revokedAt = new Date().toISOString();
  sessions.set(session.id, session);
  await persistSession(session);
  recordSecurityEvent('session.revoked', {
    actorId: session.userId,
    targetId: sessionId,
    detail: { reason },
  });
  return session;
}

export async function revokeAllUserSessions(userId: string, reason = 'logout_all') {
  const affected = await listUserSessions(userId);
  for (const session of affected) {
    await revokeSession(session.id, reason);
  }
  return affected.length;
}

export async function rotateRefreshToken(sessionId: string, presentedRefreshToken: string) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error('Invalid refresh token');
  }
  if (session.revokedAt || new Date(session.expiresAt).getTime() < Date.now()) {
    throw new Error('Session expired');
  }

  const presentedHash = hashToken(presentedRefreshToken);
  if (!tokensEqual(presentedHash, session.refreshTokenHash)) {
    await revokeAllUserSessions(session.userId, 'refresh_reuse_detected');
    recordSecurityEvent('session.refresh_reuse', {
      actorId: session.userId,
      targetId: sessionId,
    });
    throw new Error('Refresh token reuse detected. All sessions revoked.');
  }

  const replacement = await createSession({
    userId: session.userId,
    userAgent: session.userAgent,
    ip: session.ip,
  });
  session.revokedAt = new Date().toISOString();
  session.replacedBy = replacement.session.id;
  sessions.set(session.id, session);
  await persistSession(session);
  return {
    session: replacement.session,
    refreshToken: replacement.refreshToken,
    previousSessionId: sessionId,
    nextRefresh: replacement.refreshToken,
  };
}

export async function createAuthToken(userId: string, type: AuthTokenType, ttlMinutes: number) {
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
  await persistAuthToken(record);
  return { record, rawToken: raw };
}

export async function consumeAuthToken(rawToken: string, type: AuthTokenType) {
  const hash = hashToken(rawToken);
  let record = Array.from(authTokens.values()).find(
    (item) => item.type === type && !item.usedAt && tokensEqual(item.tokenHash, hash)
  );

  if (!record && hasDatabase()) {
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_auth_tokens
      WHERE type = ${type} AND used_at IS NULL AND token_hash = ${hash}
      LIMIT 1
    `) as Array<{
      id: string;
      user_id: string;
      type: AuthTokenType;
      token_hash: string;
      expires_at: string;
      used_at: string | null;
      created_at: string;
    }>;
    if (rows[0]) {
      record = {
        id: rows[0].id,
        userId: rows[0].user_id,
        type: rows[0].type,
        tokenHash: rows[0].token_hash,
        expiresAt: rows[0].expires_at,
        usedAt: rows[0].used_at ?? undefined,
        createdAt: rows[0].created_at,
      };
      authTokens.set(record.id, record);
    }
  }

  if (!record) {
    throw new Error('Invalid or expired token');
  }
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    throw new Error('Invalid or expired token');
  }
  record.usedAt = new Date().toISOString();
  authTokens.set(record.id, record);
  await persistAuthToken(record);
  return record;
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  body: string;
}) {
  const entry = { ...input, sentAt: new Date().toISOString() };
  outbox.push(entry);
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

export function getAuthOutbox() {
  return [...outbox];
}

/** @deprecated Use getAuthOutbox */
export function listEmailOutbox() {
  return getAuthOutbox();
}

export function clearAuthOutboxForTests() {
  outbox.length = 0;
  sessions.clear();
  authTokens.clear();
  loginAttempts.clear();
}

export function resetAuthSecurityStateForTests() {
  clearAuthOutboxForTests();
}
