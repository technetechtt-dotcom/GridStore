import { describe, expect, it, vi } from 'vitest';
import { getApiMode } from './apiConnection';
import { shouldUseLocalAuthFallback } from './platformApi';

vi.mock('./apiConnection', () => ({
  getApiMode: vi.fn(() => 'live'),
}));

describe('auth fallback', () => {
  it('does not fallback on invalid credentials', () => {
    vi.mocked(getApiMode).mockReturnValue('live');
    expect(shouldUseLocalAuthFallback(new Error('Invalid email or password'))).toBe(false);
    expect(shouldUseLocalAuthFallback(new Error('An account with this email already exists'))).toBe(
      false
    );
  });

  it('falls back when API is unreachable', () => {
    vi.mocked(getApiMode).mockReturnValue('live');
    expect(shouldUseLocalAuthFallback(new Error('Failed to fetch'))).toBe(true);
    expect(shouldUseLocalAuthFallback(new Error('HTTP 404: Not found'))).toBe(true);
    expect(shouldUseLocalAuthFallback(new Error('HTTP 502: Bad Gateway'))).toBe(true);
    expect(shouldUseLocalAuthFallback(new Error('HTTP 503: Service Unavailable'))).toBe(true);
  });

  it('falls back in demo mode', () => {
    vi.mocked(getApiMode).mockReturnValue('demo');
    expect(shouldUseLocalAuthFallback(new Error('anything'))).toBe(true);
  });

  it('does not throw when error message is missing', () => {
    vi.mocked(getApiMode).mockReturnValue('live');
    const error = new Error();
    Object.defineProperty(error, 'message', { value: undefined });
    expect(() => shouldUseLocalAuthFallback(error)).not.toThrow();
    expect(shouldUseLocalAuthFallback(error)).toBe(false);
  });
});
