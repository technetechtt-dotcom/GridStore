import type { AppUser, Order, SellerListing, TrustReport, UserRole } from '../types';
import { buildApiUrl, parseJsonResponse } from './apiUrl';
import { getAuthToken } from './platformApi';

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await parseJsonResponse<{ error?: string }>(response.clone());
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return parseJsonResponse<T>(response);
}

export interface AdminStats {
  totalUsers: number;
  totalOrders: number;
  totalListings: number;
  openReports: number;
  pendingBookings: number;
  revenueTotal: number;
}

export interface AdminAnalyticsPoint {
  month: string;
  revenue: number;
  orders: number;
}

export interface AdminOrderRow extends Order {
  buyerName: string;
  buyerEmail: string;
}

export interface AdminPaymentRow {
  id: string;
  reference: string;
  method: string;
  amount: number;
  status: string;
  buyer: string;
  createdAt: string;
}

export interface AdminSettings {
  features: Array<{ key: string; label: string; enabled: boolean }>;
  regions: string[];
  environment: string;
}

export function apiGetAdminStats() {
  return adminFetch<AdminStats>('/admin/stats');
}

export function apiGetAdminAnalytics() {
  return adminFetch<AdminAnalyticsPoint[]>('/admin/analytics');
}

export function apiGetAdminUsers() {
  return adminFetch<AppUser[]>('/admin/users');
}

export function apiUpdateAdminUser(userId: string, patch: { role?: UserRole; verified?: boolean }) {
  return adminFetch<AppUser>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function apiGetAdminListings() {
  return adminFetch<SellerListing[]>('/admin/listings');
}

export function apiUpdateAdminListing(listingId: string, status: SellerListing['status']) {
  return adminFetch<SellerListing>(`/admin/listings/${encodeURIComponent(listingId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function apiGetAdminOrders() {
  return adminFetch<AdminOrderRow[]>('/admin/orders');
}

export function apiUpdateAdminOrder(
  orderId: string,
  patch: { status?: Order['status']; paymentStatus?: Order['paymentStatus'] }
) {
  return adminFetch<AdminOrderRow>(`/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function apiGetAdminPayments() {
  return adminFetch<AdminPaymentRow[]>('/admin/payments');
}

export function apiGetAdminReports() {
  return adminFetch<TrustReport[]>('/admin/reports');
}

export function apiUpdateAdminReport(reportId: string, status: TrustReport['status']) {
  return adminFetch<TrustReport>(`/admin/reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function apiGetAdminSettings() {
  return adminFetch<AdminSettings>('/admin/settings');
}
