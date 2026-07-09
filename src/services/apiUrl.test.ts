import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApiUrl } from './apiUrl';

describe('buildApiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds relative API paths for local proxying', () => {
    vi.stubEnv('VITE_API_BASE_URL', '/api');
    expect(buildApiUrl('/products')).toBe('/api/products');
    expect(buildApiUrl('/products', { q: 'camera' })).toBe('/api/products?q=camera');
  });

  it('builds absolute API URLs for deployed static hosts', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://gridstore-api.onrender.com/api');
    expect(buildApiUrl('/products')).toBe('https://gridstore-api.onrender.com/api/products');
    expect(buildApiUrl('/admin/stats')).toBe('https://gridstore-api.onrender.com/api/admin/stats');
  });
});
