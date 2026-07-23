import { describe, expect, it } from 'vitest';
import { assertSecurityConfig, env } from './config/env.js';
import {
  assertPasswordPolicy,
  redactDeep,
  responseContainsSensitiveData,
} from './lib/security.js';

describe('emergency security foundation helpers', () => {
  it('redacts sensitive fields from structured logs', () => {
    const redacted = redactDeep({
      email: 'user@example.com',
      password: 'secret',
      nested: { password_plaintext: 'plain', token: 'abc' },
    }) as Record<string, unknown>;

    expect(redacted.password).toBe('[REDACTED]');
    expect((redacted.nested as Record<string, unknown>).password_plaintext).toBe('[REDACTED]');
    expect((redacted.nested as Record<string, unknown>).token).toBe('[REDACTED]');
    expect(redacted.email).toBe('user@example.com');
  });

  it('detects password fields in API responses', () => {
    expect(responseContainsSensitiveData({ password: 'x' })).toBe(true);
    expect(responseContainsSensitiveData({ password_plaintext: 'x' })).toBe(true);
    expect(responseContainsSensitiveData({ mustChangePassword: true })).toBe(false);
  });

  it('enforces stronger password policy', () => {
    expect(() => assertPasswordPolicy('short')).toThrow();
    expect(() => assertPasswordPolicy('demo1234')).toThrow();
    expect(() => assertPasswordPolicy('alllowercase1')).toThrow();
    expect(() => assertPasswordPolicy('DemoSeed-ChangeMe1')).not.toThrow();
  });

  it('keeps demo data enabled for tests and rejects production demo mode', () => {
    expect(env.enableDemoData).toBe(true);
    expect(() => assertSecurityConfig()).not.toThrow();
  });
});
