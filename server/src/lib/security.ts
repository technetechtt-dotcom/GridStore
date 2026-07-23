import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'passwordplaintext',
  'password_hash',
  'password_plaintext',
  'token',
  'sessiontoken',
  'authorization',
  'secret',
  'mfasecret',
  'mfa_secret',
  'refreshtoken',
  'refresh_token',
  'cardnumber',
  'cvv',
  'cvc',
]);

export function createRequestId() {
  return `req_${randomBytes(12).toString('hex')}`;
}

export function redactValue(key: string, value: unknown): unknown {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (SENSITIVE_KEYS.has(normalized) || normalized.includes('password') || normalized.includes('secret')) {
    return '[REDACTED]';
  }
  return value;
}

export function redactDeep(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => redactDeep(item));
  }
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [
        key,
        redactValue(key, redactDeep(value)),
      ])
    );
  }
  return input;
}

export function responseContainsSensitiveData(payload: unknown): boolean {
  const serialized = JSON.stringify(payload ?? {});
  return /"(password|passwordPlaintext|password_plaintext|mfaSecret|mfa_secret)"\s*:/i.test(
    serialized
  );
}

type LogLevel = 'info' | 'warn' | 'error' | 'security';

function writeLog(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta ? { meta: redactDeep(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn' || level === 'security') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => writeLog('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => writeLog('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => writeLog('error', message, meta),
  security: (message: string, meta?: Record<string, unknown>) => writeLog('security', message, meta),
};

export interface SecurityAuditEvent {
  id: string;
  type: string;
  actorId?: string;
  targetId?: string;
  ip?: string;
  requestId?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

const memoryAuditEvents: SecurityAuditEvent[] = [];

export function recordSecurityEvent(
  type: string,
  detail: {
    actorId?: string;
    targetId?: string;
    ip?: string;
    requestId?: string;
    detail?: Record<string, unknown>;
  } = {}
) {
  const event: SecurityAuditEvent = {
    id: createRequestId().replace('req_', 'sec_'),
    type,
    actorId: detail.actorId,
    targetId: detail.targetId,
    ip: detail.ip,
    requestId: detail.requestId,
    detail: detail.detail ? (redactDeep(detail.detail) as Record<string, unknown>) : undefined,
    createdAt: new Date().toISOString(),
  };
  memoryAuditEvents.unshift(event);
  if (memoryAuditEvents.length > 500) {
    memoryAuditEvents.length = 500;
  }
  logger.security(type, {
    actorId: event.actorId,
    targetId: event.targetId,
    ip: event.ip,
    requestId: event.requestId,
    detail: event.detail,
  });
  return event;
}

export function listSecurityEvents(limit = 100) {
  return memoryAuditEvents.slice(0, limit);
}

/** Minimal TOTP (RFC 6238) helper for admin/moderator MFA. */
export function generateMfaSecret() {
  return randomBytes(20).toString('base64url');
}

function hotp(secret: Buffer, counter: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  const code =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secretBase64Url: string, token: string, window = 1) {
  if (!/^\d{6}$/.test(token)) return false;
  const secret = Buffer.from(secretBase64Url, 'base64url');
  const timestep = Math.floor(Date.now() / 1000 / 30);
  for (let drift = -window; drift <= window; drift += 1) {
    const expected = hotp(secret, timestep + drift);
    const a = Buffer.from(expected);
    const b = Buffer.from(token);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true;
    }
  }
  return false;
}

export function assertPasswordPolicy(password: string) {
  if (password.length < 10) {
    throw new Error('Password must be at least 10 characters');
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Password must include upper, lower, and numeric characters');
  }
  const blocked = ['demo1234', 'password', 'password1', '12345678', 'qwerty123'];
  if (blocked.includes(password.toLowerCase())) {
    throw new Error('Password is too common. Choose a stronger password.');
  }
}
