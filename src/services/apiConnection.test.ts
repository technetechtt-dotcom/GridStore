import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkApiConnection,
  getConnectionSummary,
  getConnectionStatus,
  subscribeConnectionStatus,
} from './apiConnection';

describe('apiConnection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('marks platform connected when health check succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          service: 'gridstore-api',
          marketplaceUrl: 'http://localhost:5173',
          opsDashboardUrl: 'http://localhost:5174',
          timestamp: new Date().toISOString(),
        }),
      })
    );

    const connected = await checkApiConnection();

    expect(connected).toBe(true);
    expect(getConnectionStatus()).toBe('connected');
    expect(getConnectionSummary().marketplaceUrl).toBe('http://localhost:5173');
  });

  it('marks platform disconnected when health check fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

    const connected = await checkApiConnection();

    expect(connected).toBe(false);
    expect(getConnectionStatus()).toBe('disconnected');
  });

  it('notifies connection status subscribers', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConnectionStatus(listener);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'ok',
          service: 'gridstore-api',
          timestamp: new Date().toISOString(),
        }),
      })
    );

    await checkApiConnection();

    expect(listener).toHaveBeenCalledWith('checking');
    expect(listener).toHaveBeenCalledWith('connected');

    unsubscribe();
  });
});
