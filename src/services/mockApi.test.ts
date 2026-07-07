import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askAiAssistant,
  getJobs,
  getMarketplaceProducts,
  getProductById,
  getServices,
} from './mockApi';

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps marketplace response payload from backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'prod-1',
            title: 'Sony Camera',
            category: 'Electronics',
            price: 12000,
            rating: 4.8,
            reviews: 42,
            seller: 'Camera Co',
            location: 'Cape Town',
            badge: 'Trending',
            image: 'https://example.com/image.jpg',
            description: 'Mirrorless camera',
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const items = await getMarketplaceProducts('sony');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Sony Camera');
    expect(items[0].price).toBe(12000);
  });

  it('maps snake_case fields for product details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'prod-2',
          title: 'Solar Kit',
          category: 'Energy',
          price: 32000,
          rating: 4.9,
          reviews: 14,
          seller: 'PowerSmart',
          location: 'Durban',
          image: 'https://example.com/solar.jpg',
          description: 'Solar backup kit',
        }),
      })
    );

    const item = await getProductById('prod-2');

    expect(item?.id).toBe('prod-2');
    expect(item?.seller).toBe('PowerSmart');
  });

  it('posts ai prompt and reads answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: 'Custom AI answer' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await askAiAssistant('Need best inverter');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response).toBe('Custom AI answer');
  });

  it('falls back to local data if backend fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

    const services = await getServices('development');
    const jobs = await getJobs('developer');

    expect(services.length).toBeGreaterThan(0);
    expect(jobs.length).toBeGreaterThan(0);
  });
});
