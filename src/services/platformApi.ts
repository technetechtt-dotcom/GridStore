import type {
  AppUser,
  BookingRequest,
  JobApplication,
  MessageThread,
  NotificationItem,
  Order,
  OrderLine,
  RentalReservation,
  SellerListing,
  StoreProfile,
  TrustReport,
  UserRole,
} from '../types';
import { getApiMode } from './apiConnection';
import { buildApiUrl, parseJsonResponse } from './apiUrl';

const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS ?? '10000');
export const AUTH_TOKEN_KEY = 'gridstore-auth-token';

type QueryParams = Record<string, string | number | boolean | undefined>;

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

export function hydrateAuthToken(user: Pick<AppUser, 'sessionToken'> | null | undefined) {
  if (!user?.sessionToken || getAuthToken()) return;
  setAuthToken(user.sessionToken);
}

export const AUTH_SESSION_EXPIRED_EVENT = 'gridstore-auth-session-expired';

export function notifyAuthSessionExpired() {
  if (typeof window === 'undefined') return;
  setAuthToken(null);
  window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
}

export function isPlatformApiAvailable() {
  return getApiMode() === 'live';
}

/** When true, auth falls back to local demo login instead of surfacing the API error. */
export function shouldUseLocalAuthFallback(error: unknown) {
  if (getApiMode() === 'demo') return true;
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('abort')) {
    return true;
  }
  if (message.includes('404') || message.includes('not found')) {
    return true;
  }
  return false;
}

export async function probeAuthApi() {
  try {
    await platformFetch<{ status: string }>('/health', { auth: false });
    return true;
  } catch {
    return false;
  }
}

export async function platformFetch<T>(
  path: string,
  options: RequestInit & { query?: QueryParams; auth?: boolean } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const token = getAuthToken();

  try {
    const response = await fetch(buildApiUrl(path, options.query), {
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
        const body = await parseJsonResponse<{ error?: string }>(response.clone());
        if (body.error) message = body.error;
      } catch {
        // ignore parse errors
      }
      if (response.status === 401 && options.auth !== false) {
        notifyAuthSessionExpired();
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await parseJsonResponse<unknown>(response);
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
    saleMode: (row.saleMode ?? row.sale_mode) as SellerListing['saleMode'],
    haggleEnabled: Boolean(row.haggleEnabled ?? row.haggle_enabled),
    startingBid:
      row.startingBid != null || row.starting_bid != null
        ? Number(row.startingBid ?? row.starting_bid)
        : undefined,
    currentBid:
      row.currentBid != null || row.current_bid != null
        ? Number(row.currentBid ?? row.current_bid)
        : undefined,
    bidIncrement:
      row.bidIncrement != null || row.bid_increment != null
        ? Number(row.bidIncrement ?? row.bid_increment)
        : undefined,
    reservePrice:
      row.reservePrice != null || row.reserve_price != null
        ? Number(row.reservePrice ?? row.reserve_price)
        : undefined,
    auctionEndsAt:
      row.auctionEndsAt ?? row.auction_ends_at
        ? String(row.auctionEndsAt ?? row.auction_ends_at)
        : undefined,
    auctionStatus: (row.auctionStatus ?? row.auction_status) as SellerListing['auctionStatus'],
    bidCount:
      row.bidCount != null || row.bid_count != null
        ? Number(row.bidCount ?? row.bid_count)
        : undefined,
  };
}

export async function apiGetListing(listingId: string) {
  const row = await platformFetch<Record<string, unknown>>(`/listings/${encodeURIComponent(listingId)}`, {
    auth: false,
  });
  return normalizeListing(row);
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
  saleMode?: 'fixed' | 'haggle' | 'auction';
  haggleEnabled?: boolean;
  startingBid?: number;
  bidIncrement?: number;
  reservePrice?: number;
  auctionDurationHours?: number;
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
    saleMode: 'fixed' | 'haggle' | 'auction';
    haggleEnabled: boolean;
    startingBid: number;
    bidIncrement: number;
    reservePrice: number;
    auctionDurationHours: number;
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

export async function apiGetCart() {
  return platformFetch<Record<string, number>>('/cart');
}

export async function apiSaveCart(cart: Record<string, number>) {
  return platformFetch<Record<string, number>>('/cart', {
    method: 'PUT',
    body: JSON.stringify(cart),
  });
}

export async function apiGetWishlist() {
  return platformFetch<string[]>('/wishlist');
}

export async function apiSaveWishlist(productIds: string[]) {
  return platformFetch<string[]>('/wishlist', {
    method: 'PUT',
    body: JSON.stringify({ productIds }),
  });
}

export async function apiGetNotifications() {
  return platformFetch<NotificationItem[]>('/notifications');
}

export async function apiMarkNotificationRead(notificationId: string) {
  return platformFetch<NotificationItem[]>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  });
}

export async function apiClearNotifications() {
  return platformFetch<NotificationItem[]>('/notifications/clear', { method: 'POST' });
}

export async function apiGetMessageThreads() {
  return platformFetch<MessageThread[]>('/messages/threads');
}

export async function apiSendMessage(
  threadId: string,
  input: { text: string; author?: 'buyer' | 'seller'; title?: string; participant?: string }
) {
  return platformFetch<MessageThread[]>(`/messages/threads/${encodeURIComponent(threadId)}`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function apiGetBookings() {
  return platformFetch<BookingRequest[]>('/bookings');
}

export async function apiCreateBooking(input: {
  serviceId: string;
  serviceTitle: string;
  provider: string;
  requestedDate?: string;
  note?: string;
}) {
  return platformFetch<BookingRequest>('/bookings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function apiGetReservations() {
  return platformFetch<RentalReservation[]>('/reservations');
}

export async function apiCreateReservation(input: {
  rentalId: string;
  rentalTitle: string;
  startDate: string;
  endDate: string;
}) {
  return platformFetch<RentalReservation>('/reservations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function apiGetApplications() {
  return platformFetch<JobApplication[]>('/applications');
}

export async function apiCreateApplication(input: {
  jobId: string;
  jobTitle: string;
  applicantName?: string;
  cvFileName?: string;
}) {
  return platformFetch<JobApplication>('/applications', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function apiGetReports() {
  return platformFetch<TrustReport[]>('/reports');
}

export async function apiCreateReport(input: {
  targetType: TrustReport['targetType'];
  targetId: string;
  reason?: string;
}) {
  return platformFetch<TrustReport>('/reports', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

function normalizeStore(row: Record<string, unknown>): StoreProfile {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    category: String(row.category ?? ''),
    rating: Number(row.rating ?? 0),
    followers: Number(row.followers ?? 0),
    location: String(row.location ?? ''),
    description: String(row.description ?? ''),
    supportEmail:
      row.supportEmail != null || row.support_email != null
        ? String(row.supportEmail ?? row.support_email)
        : undefined,
    status: (row.status as StoreProfile['status']) ?? 'active',
    verified: Boolean(row.verified),
    image: row.image ? String(row.image) : undefined,
  };
}

export async function apiGetMyStores() {
  const rows = await platformFetch<Record<string, unknown>[]>('/stores/mine');
  return rows.map(normalizeStore);
}

export async function apiCreateStore(input: {
  name: string;
  category: string;
  location: string;
  description: string;
  supportEmail?: string;
  status?: 'active' | 'draft' | 'paused';
}) {
  const row = await platformFetch<Record<string, unknown>>('/stores', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return normalizeStore(row);
}

export async function apiUpdateStore(
  storeId: string,
  input: Partial<{
    name: string;
    category: string;
    location: string;
    description: string;
    supportEmail: string;
    status: 'active' | 'draft' | 'paused';
  }>
) {
  const row = await platformFetch<Record<string, unknown>>(`/stores/${encodeURIComponent(storeId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return normalizeStore(row);
}

export async function syncPlatformData() {
  const token = getAuthToken();
  const [
    activeListings,
    myListings,
    orders,
    me,
    cart,
    wishlist,
    notifications,
    messageThreads,
    bookingRequests,
    rentalReservations,
    jobApplications,
    trustReports,
    sellerStores,
  ] = await Promise.all([
    apiGetActiveListings(),
    token ? apiGetMyListings().catch(() => [] as SellerListing[]) : Promise.resolve([]),
    token ? apiGetOrders().catch(() => [] as Order[]) : Promise.resolve([]),
    token ? apiGetMe().catch(() => null) : Promise.resolve(null),
    token ? apiGetCart().catch(() => ({} as Record<string, number>)) : Promise.resolve({}),
    token ? apiGetWishlist().catch(() => [] as string[]) : Promise.resolve([]),
    token ? apiGetNotifications().catch(() => [] as NotificationItem[]) : Promise.resolve([]),
    token ? apiGetMessageThreads().catch(() => [] as MessageThread[]) : Promise.resolve([]),
    token ? apiGetBookings().catch(() => [] as BookingRequest[]) : Promise.resolve([]),
    token ? apiGetReservations().catch(() => [] as RentalReservation[]) : Promise.resolve([]),
    token ? apiGetApplications().catch(() => [] as JobApplication[]) : Promise.resolve([]),
    token ? apiGetReports().catch(() => [] as TrustReport[]) : Promise.resolve([]),
    token ? apiGetMyStores().catch(() => [] as StoreProfile[]) : Promise.resolve([]),
  ]);

  const listingMap = new Map<string, SellerListing>();
  activeListings.forEach((listing) => listingMap.set(listing.id, listing));
  myListings.forEach((listing) => listingMap.set(listing.id, listing));

  return {
    user: me,
    orders,
    sellerListings: Array.from(listingMap.values()),
    cart,
    wishlistIds: wishlist,
    notifications,
    messageThreads,
    bookingRequests,
    rentalReservations,
    jobApplications,
    trustReports,
    sellerStores,
  };
}
