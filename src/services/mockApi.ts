import { jobs, products, rentals, services, stores } from '../data/catalog';
import type { Job, Product, Rental, Service, StoreProfile } from '../types';
import { notifyApiRequestFailure, notifyApiRequestSuccess } from './apiConnection';
import { buildApiUrl, parseJsonResponse } from './apiUrl';

export {
  getApiMode,
  probeApiConnection,
  subscribeApiMode,
  type ApiMode,
} from './apiConnection';

const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? '10000');

interface ApiEndpoints {
  products: string;
  productById: string;
  services: string;
  rentals: string;
  jobs: string;
  stores: string;
  aiAssistant: string;
}

const endpoints: ApiEndpoints = {
  products: import.meta.env.VITE_API_PRODUCTS_PATH ?? '/products',
  productById: import.meta.env.VITE_API_PRODUCT_PATH ?? '/products/:id',
  services: import.meta.env.VITE_API_SERVICES_PATH ?? '/services',
  rentals: import.meta.env.VITE_API_RENTALS_PATH ?? '/rentals',
  jobs: import.meta.env.VITE_API_JOBS_PATH ?? '/jobs',
  stores: import.meta.env.VITE_API_STORES_PATH ?? '/stores',
  aiAssistant: import.meta.env.VITE_API_AI_ASSISTANT_PATH ?? '/ai/assist',
};

type QueryPrimitive = string | number | boolean;
type QueryParams = Record<string, QueryPrimitive | undefined>;

function snakeValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function queryMatch(value: string | undefined | null, query: string | undefined | null) {
  if (!value || !query?.trim()) return false;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function extractData<T>(payload: unknown): T {
  if (Array.isArray(payload)) return payload as T;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function fetchJson<T>(path: string, query?: QueryParams, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(buildApiUrl(path, query), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 503) {
        try {
          const body = await parseJsonResponse<{ status?: string }>(response.clone());
          if (body.status === 'starting') {
            throw new Error('API is starting up');
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'API is starting up') {
            throw error;
          }
        }
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = await parseJsonResponse<unknown>(response);
    return extractData<T>(payload);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function isTransientApiError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error ?? '').toLowerCase();
  return (
    message.includes('starting up') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('abort')
  );
}

function filterProducts(query: string, category: string) {
  return products.filter((item) => {
    const matchesQuery =
      !query.trim() ||
      [item.title, item.category, item.seller, item.location].some((field) =>
        queryMatch(field, query)
      );
    const matchesCategory = !category || category === 'all' || item.category === category;
    return matchesQuery && matchesCategory;
  });
}

function normalizeProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    title: snakeValue(row.title),
    category: snakeValue(row.category),
    price: numberValue(row.price),
    rating: numberValue(row.rating),
    reviews: numberValue(row.reviews),
    seller: snakeValue(row.seller),
    location: snakeValue(row.location),
    badge: snakeValue(row.badge) || undefined,
    image: snakeValue(row.image),
    description: snakeValue(row.description),
  };
}

function normalizeService(row: Record<string, unknown>): Service {
  return {
    id: String(row.id),
    title: snakeValue(row.title),
    provider: snakeValue(row.provider),
    category: snakeValue(row.category),
    priceLabel: snakeValue(row.priceLabel ?? row.price_label),
    rating: numberValue(row.rating),
    location: snakeValue(row.location),
    image: snakeValue(row.image),
    description: snakeValue(row.description),
  };
}

function normalizeRental(row: Record<string, unknown>): Rental {
  return {
    id: String(row.id),
    title: snakeValue(row.title),
    owner: snakeValue(row.owner),
    category: snakeValue(row.category),
    dailyRate: numberValue(row.dailyRate ?? row.daily_rate),
    location: snakeValue(row.location),
    image: snakeValue(row.image),
    description: snakeValue(row.description),
  };
}

function normalizeJob(row: Record<string, unknown>): Job {
  return {
    id: String(row.id),
    title: snakeValue(row.title),
    company: snakeValue(row.company),
    location: snakeValue(row.location),
    salaryLabel: snakeValue(row.salaryLabel ?? row.salary_label),
    type: snakeValue(row.type),
    description: snakeValue(row.description),
  };
}

function normalizeStore(row: Record<string, unknown>): StoreProfile {
  const id = String(row.id);
  const catalogMatch = stores.find((store) => store.id === id);
  const base: StoreProfile = {
    id,
    name: snakeValue(row.name) || catalogMatch?.name || '',
    category: snakeValue(row.category) || catalogMatch?.category || '',
    rating: numberValue(row.rating) || catalogMatch?.rating || 0,
    followers: numberValue(row.followers) || catalogMatch?.followers || 0,
    location: snakeValue(row.location) || catalogMatch?.location || '',
    description: snakeValue(row.description) || catalogMatch?.description || '',
    supportEmail:
      row.supportEmail != null || row.support_email != null
        ? snakeValue(row.supportEmail ?? row.support_email)
        : catalogMatch?.supportEmail,
    status: (row.status as StoreProfile['status']) ?? catalogMatch?.status ?? 'active',
    verified: row.verified != null ? Boolean(row.verified) : catalogMatch?.verified,
    image: row.image ? snakeValue(row.image) : catalogMatch?.image,
  };

  if (!catalogMatch) return base;

  return {
    ...catalogMatch,
    ...base,
    image: base.image || catalogMatch.image,
    supportEmail: base.supportEmail || catalogMatch.supportEmail,
    verified: base.verified ?? catalogMatch.verified,
  };
}

export async function getMarketplaceProducts(query = '', category = ''): Promise<Product[]> {
  try {
    const rows = await fetchJson<Record<string, unknown>[]>(endpoints.products, {
      q: query || undefined,
      category: category && category !== 'all' ? category : undefined,
    });
    notifyApiRequestSuccess();
    return rows.map(normalizeProduct);
  } catch (error) {
    if (!isTransientApiError(error)) {
      notifyApiRequestFailure(error);
    }
    return filterProducts(query, category);
  }
}

export async function getProductById(id: string): Promise<Product | null> {
  try {
    const path = endpoints.productById.replace(':id', encodeURIComponent(id));
    const row = await fetchJson<Record<string, unknown> | null>(path);
    notifyApiRequestSuccess();
    return row ? normalizeProduct(row) : null;
  } catch (error) {
    notifyApiRequestFailure(error);
    return products.find((item) => item.id === id) ?? null;
  }
}

export async function getServices(query = ''): Promise<Service[]> {
  try {
    const rows = await fetchJson<Record<string, unknown>[]>(endpoints.services, { q: query || undefined });
    notifyApiRequestSuccess();
    return rows.map(normalizeService);
  } catch (error) {
    notifyApiRequestFailure(error);
    if (!query.trim()) return services;
    return services.filter((item) =>
      [item.title, item.provider, item.category, item.location].some((field) =>
        queryMatch(field, query)
      )
    );
  }
}

export async function getServiceById(id: string): Promise<Service | null> {
  try {
    const path = `/services/${encodeURIComponent(id)}`;
    const row = await fetchJson<Record<string, unknown> | null>(path);
    notifyApiRequestSuccess();
    return row ? normalizeService(row) : null;
  } catch (error) {
    notifyApiRequestFailure(error);
    return services.find((item) => item.id === id) ?? null;
  }
}

export async function getRentals(query = ''): Promise<Rental[]> {
  try {
    const rows = await fetchJson<Record<string, unknown>[]>(endpoints.rentals, { q: query || undefined });
    notifyApiRequestSuccess();
    return rows.map(normalizeRental);
  } catch (error) {
    notifyApiRequestFailure(error);
    if (!query.trim()) return rentals;
    return rentals.filter((item) =>
      [item.title, item.owner, item.category, item.location].some((field) =>
        queryMatch(field, query)
      )
    );
  }
}

export async function getRentalById(id: string): Promise<Rental | null> {
  try {
    const path = `/rentals/${encodeURIComponent(id)}`;
    const row = await fetchJson<Record<string, unknown> | null>(path);
    notifyApiRequestSuccess();
    return row ? normalizeRental(row) : null;
  } catch (error) {
    notifyApiRequestFailure(error);
    return rentals.find((item) => item.id === id) ?? null;
  }
}

export async function getJobs(query = ''): Promise<Job[]> {
  try {
    const rows = await fetchJson<Record<string, unknown>[]>(endpoints.jobs, { q: query || undefined });
    notifyApiRequestSuccess();
    return rows.map(normalizeJob);
  } catch (error) {
    notifyApiRequestFailure(error);
    if (!query.trim()) return jobs;
    return jobs.filter((item) =>
      [item.title, item.company, item.location, item.type].some((field) =>
        queryMatch(field, query)
      )
    );
  }
}

export async function getJobById(id: string): Promise<Job | null> {
  try {
    const path = `/jobs/${encodeURIComponent(id)}`;
    const row = await fetchJson<Record<string, unknown> | null>(path);
    notifyApiRequestSuccess();
    return row ? normalizeJob(row) : null;
  } catch (error) {
    notifyApiRequestFailure(error);
    return jobs.find((item) => item.id === id) ?? null;
  }
}

export async function getStores(query = ''): Promise<StoreProfile[]> {
  try {
    const rows = await fetchJson<Record<string, unknown>[]>(endpoints.stores, { q: query || undefined });
    notifyApiRequestSuccess();
    return rows.map(normalizeStore);
  } catch (error) {
    notifyApiRequestFailure(error);
    if (!query.trim()) return stores;
    return stores.filter((item) =>
      [item.name, item.category, item.location].some((field) =>
        queryMatch(field, query)
      )
    );
  }
}

export async function getStoreById(id: string): Promise<StoreProfile | null> {
  try {
    const path = `/stores/${encodeURIComponent(id)}`;
    const row = await fetchJson<Record<string, unknown> | null>(path);
    notifyApiRequestSuccess();
    return row ? normalizeStore(row) : null;
  } catch (error) {
    notifyApiRequestFailure(error);
    return stores.find((item) => item.id === id) ?? null;
  }
}

export async function askAiAssistant(prompt: string): Promise<string> {
  try {
    const payload = await fetchJson<{ answer?: string } | string>(endpoints.aiAssistant, undefined, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });

    if (typeof payload === 'string') {
      notifyApiRequestSuccess();
      return payload;
    }
    if (payload.answer) {
      notifyApiRequestSuccess();
      return payload.answer;
    }
    notifyApiRequestSuccess();
    return 'AI assistant responded, but no answer text was returned.';
  } catch (error) {
    notifyApiRequestFailure(error);
    if (!prompt.trim()) {
      return 'Tell me what you need, your budget, and your location and I will suggest a bundle.';
    }

    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes('solar') || lowerPrompt.includes('inverter')) {
      return 'For solar in South Africa, compare inverter size, battery cycle life, and certified installers in your area. I found strong matches in PowerSmart Energy.';
    }

    if (lowerPrompt.includes('plumber') || lowerPrompt.includes('electrician')) {
      return 'For urgent services, prioritize verified providers with 4.7+ ratings and response time under 30 minutes. I can shortlist 3 options near you.';
    }

    if (lowerPrompt.includes('podcast') || lowerPrompt.includes('mic')) {
      return 'Starter podcast setup: dynamic mic + closed-back headphones + basic audio interface. I can build a cart under your budget from top-rated listings.';
    }

    return 'I found relevant products, services, and rentals. Use marketplace filters for price, location, and trust score to narrow to best-fit options.';
  }
}
