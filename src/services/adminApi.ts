import type { AppUser, Order, SellerListing, TrustReport, UserRole } from '../types';
import { platformFetch } from './platformApi';

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
  return platformFetch<AdminStats>('/admin/stats');
}

export function apiGetAdminAnalytics() {
  return platformFetch<AdminAnalyticsPoint[]>('/admin/analytics');
}

export function apiGetAdminUsers() {
  return platformFetch<AppUser[]>('/admin/users');
}

export function apiUpdateAdminUser(userId: string, patch: { role?: UserRole; verified?: boolean }) {
  return platformFetch<AppUser>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function apiGetAdminListings() {
  return platformFetch<SellerListing[]>('/admin/listings');
}

export function apiUpdateAdminListing(listingId: string, status: SellerListing['status']) {
  return platformFetch<SellerListing>(`/admin/listings/${encodeURIComponent(listingId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function apiGetAdminOrders() {
  return platformFetch<AdminOrderRow[]>('/admin/orders');
}

export function apiUpdateAdminOrder(
  orderId: string,
  patch: { status?: Order['status']; paymentStatus?: Order['paymentStatus'] }
) {
  return platformFetch<AdminOrderRow>(`/admin/orders/${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function apiGetAdminPayments() {
  return platformFetch<AdminPaymentRow[]>('/admin/payments');
}

export function apiGetAdminReports() {
  return platformFetch<TrustReport[]>('/admin/reports');
}

export function apiUpdateAdminReport(reportId: string, status: TrustReport['status']) {
  return platformFetch<TrustReport>(`/admin/reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function apiGetAdminSettings() {
  return platformFetch<AdminSettings>('/admin/settings');
}
