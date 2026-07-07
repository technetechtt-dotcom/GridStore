import type { AppUser, Order, OrderLine, SellerListing, UserRole } from '../types';
import { getApiMode } from './mockApi';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? '10000');
export const AUTH_TOKEN_KEY = 'gridstore-auth-token';

type QueryParams = Record<string, string | number | boolean | undefined>;

function getBaseOrigin() {
  if (typeof globalThis.location !== 'undefined' && globalThis.location.origin) {
    return globalThis.location.origin;
  }
  return 'http://localhost';
}

function buildUrl(path: string, query?: QueryParams) {
  const url = new URL(`${API_BASE_URL}${path}`, getBaseOrigin());
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }
  return `${url.pathname}${url.search}`;
}

function extractData<T>(payload: unknown): T {
  if (Array.isArray(payload)) return payload as T;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export function getAuthToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export function isPlatformApiAvailable() {
  return getApiMode() === 'live';
}

async function platformFetch<T>(
  path: string,
  options: RequestInit & { query?: QueryParams; auth?: boolean } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const token = getAuthToken();

  try {
    const response = await fetch(buildUrl(path, options.query), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.auth !== false && token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = (await response.json()) as unknown;
    return extractData<T>(payload);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function apiLogin(email: string, password: string, role: UserRole = 'buyer') {
  const payload = await platformFetch<{ user: AppUser & { sessionToken: string } }>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
      auth: false,
    }
  );
  setAuthToken(payload.user.sessionToken);
  return payload.user;
}

export async function apiSignup(
  name: string,
  email: string,
  password: string,
  role: UserRole = 'buyer'
) {
  const payload = await platformFetch<{ user: AppUser & { sessionToken: string } }>(
    '/auth/signup',
    {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
      auth: false,
    }
  );
  setAuthToken(payload.user.sessionToken);
  return payload.user;
}

export async function apiOAuthLogin(provider: 'google' | 'github', role: UserRole = 'buyer') {
  const payload = await platformFetch<{ user: AppUser & { sessionToken: string } }>(
    '/auth/oauth',
    {
      method: 'POST',
      body: JSON.stringify({ provider, role }),
      auth: false,
    }
  );
  setAuthToken(payload.user.sessionToken);
  return payload.user;
}

export async function apiRequestPasswordReset(email: string) {
  return platformFetch<{ message: string }>('/auth/password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
    auth: false,
  });
}

export async function apiGetMe() {
  const payload = await platformFetch<{ user: AppUser & { sessionToken?: string } }>('/auth/me');
  if (payload.user.sessionToken) {
    setAuthToken(payload.user.sessionToken);
  }
  return payload.user;
}

export async function apiUpdateProfile(input: { name: string; email: string }) {
  const payload = await platformFetch<{ user: AppUser & { sessionToken?: string } }>(
    '/auth/profile',
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    }
  );
  if (payload.user.sessionToken) {
    setAuthToken(payload.user.sessionToken);
  }
  return payload.user;
}

export async function apiLogout() {
  try {
    await platformFetch('/auth/logout', { method: 'POST' });
  } finally {
    setAuthToken(null);
  }
}

export async function apiGetOrders() {
  return platformFetch<Order[]>('/orders');
}

export async function apiCreateOrder(input: {
  deliveryAddress: string;
  paymentMethod: string;
  lines: OrderLine[];
}) {
  return platformFetch<Order>('/orders', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function apiRefundOrder(orderId: string) {
  return platformFetch<Order>(`/orders/${encodeURIComponent(orderId)}/refund`, {
    method: 'POST',
  });
}

function normalizeListing(row: Record<string, unknown>): SellerListing {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    category: String(row.category ?? ''),
    price: Number(row.price ?? 0),
    rating: Number(row.rating ?? 0),
    reviews: Number(row.reviews ?? 0),
    seller: String(row.seller ?? ''),
    location: String(row.location ?? ''),
    badge: row.badge ? String(row.badge) : undefined,
    image: String(row.image ?? ''),
    description: String(row.description ?? ''),
    status: (row.status as SellerListing['status']) ?? 'draft',
    inventory: Number(row.inventory ?? 0),
    riskScore: Number(row.riskScore ?? row.risk_score ?? 0),
    verified: Boolean(row.verified),
  };
}

export async function apiGetActiveListings(query = '') {
  const rows = await platformFetch<Record<string, unknown>[]>('/listings', {
    query: { status: 'active', q: query || undefined },
    auth: false,
  });
  return rows.map(normalizeListing);
}

export async function apiGetMyListings() {
  const rows = await platformFetch<Record<string, unknown>[]>('/listings', {
    query: { mine: 'true' },
  });
  return rows.map(normalizeListing);
}

export async function apiCreateListing(input: {
  title: string;
  category: string;
  price: number;
  inventory: number;
  description: string;
  location: string;
}) {
  const row = await platformFetch<Record<string, unknown>>('/listings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeListing(row);
}

export async function apiUpdateListing(
  listingId: string,
  input: Partial<{
    title: string;
    category: string;
    price: number;
    inventory: number;
    description: string;
    location: string;
  }>
) {
  const row = await platformFetch<Record<string, unknown>>(
    `/listings/${encodeURIComponent(listingId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    }
  );
  return normalizeListing(row);
}

export async function apiToggleListingPause(listingId: string) {
  const row = await platformFetch<Record<string, unknown>>(
    `/listings/${encodeURIComponent(listingId)}/toggle-pause`,
    { method: 'POST' }
  );
  return normalizeListing(row);
}

export async function syncPlatformData() {
  const token = getAuthToken();
  const [activeListings, myListings, orders, me] = await Promise.all([
    apiGetActiveListings(),
    token ? apiGetMyListings().catch(() => [] as SellerListing[]) : Promise.resolve([]),
    token ? apiGetOrders().catch(() => [] as Order[]) : Promise.resolve([]),
    token ? apiGetMe().catch(() => null) : Promise.resolve(null),
  ]);

  const listingMap = new Map<string, SellerListing>();
  activeListings.forEach((listing) => listingMap.set(listing.id, listing));
  myListings.forEach((listing) => listingMap.set(listing.id, listing));

  return {
    user: me,
    orders,
    sellerListings: Array.from(listingMap.values()),
  };
}
