import { describe, expect, it, vi } from 'vitest';
import { getApiMode } from './mockApi';
import { shouldUseLocalAuthFallback } from './platformApi';

vi.mock('./mockApi', () => ({
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
  });

  it('falls back in demo mode', () => {
    vi.mocked(getApiMode).mockReturnValue('demo');
    expect(shouldUseLocalAuthFallback(new Error('anything'))).toBe(true);
  });
});
