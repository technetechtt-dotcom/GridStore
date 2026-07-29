import type {
  AppUser,
  Job,
  Order,
  Product,
  Rental,
  SellerListing,
  Service,
  StoreProfile,
  TrustReport,
  UserRole,
} from '../types';
import { platformFetch } from './platformApi';

export type CatalogItemStatus = 'active' | 'paused' | 'flagged';

export interface AdminStats {
  totalUsers: number;
  totalOrders: number;
  totalListings: number;
  totalStores: number;
  totalMarketplaceProducts: number;
  totalServices: number;
  totalRentals: number;
  totalJobs: number;
  liveAuctions: number;
  openReports: number;
  pendingBookings: number;
  revenueTotal: number;
}

export interface AdminAuctionRow extends SellerListing {
  sellerName: string;
  isLive: boolean;
}

export interface AdminStoreRow extends StoreProfile {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  createdAt?: string;
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

export interface AdminUserRow extends AppUser {
  mustChangePassword?: boolean;
  mfaEnabled?: boolean;
  createdAt?: string;
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
  return platformFetch<AdminUserRow[]>('/admin/users');
}

export function apiUpdateAdminUser(userId: string, patch: { role?: UserRole; verified?: boolean }) {
  return platformFetch<AppUser>(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function apiResetAdminUserPassword(userId: string, password: string) {
  return platformFetch<AdminUserRow>(`/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
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

export function apiGetAdminStores() {
  return platformFetch<AdminStoreRow[]>('/admin/stores');
}

export function apiUpdateAdminStore(
  storeId: string,
  patch: {
    name?: string;
    category?: string;
    location?: string;
    description?: string;
    supportEmail?: string;
    status?: StoreProfile['status'];
    verified?: boolean;
  }
) {
  return platformFetch<AdminStoreRow>(`/admin/stores/${encodeURIComponent(storeId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function apiGetAdminMarketplaceProducts() {
  return platformFetch<Product[]>('/admin/marketplace');
}

export function apiUpdateAdminMarketplaceProduct(
  productId: string,
  patch: Partial<Product> & { status?: CatalogItemStatus }
) {
  return platformFetch<Product>(`/admin/marketplace/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function apiGetAdminServices() {
  return platformFetch<Service[]>('/admin/services');
}

export function apiUpdateAdminService(
  serviceId: string,
  patch: Partial<Service> & { status?: CatalogItemStatus }
) {
  return platformFetch<Service>(`/admin/services/${encodeURIComponent(serviceId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function apiGetAdminRentals() {
  return platformFetch<Rental[]>('/admin/rentals');
}

export function apiUpdateAdminRental(
  rentalId: string,
  patch: Partial<Rental> & { status?: CatalogItemStatus }
) {
  return platformFetch<Rental>(`/admin/rentals/${encodeURIComponent(rentalId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function apiGetAdminJobs() {
  return platformFetch<Job[]>('/admin/jobs');
}

export function apiUpdateAdminJob(jobId: string, patch: Partial<Job> & { status?: CatalogItemStatus }) {
  return platformFetch<Job>(`/admin/jobs/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function apiGetAdminAuctions() {
  return platformFetch<AdminAuctionRow[]>('/admin/auctions');
}

export function apiUpdateAdminAuction(
  listingId: string,
  patch: { status?: SellerListing['status']; auctionStatus?: SellerListing['auctionStatus'] }
) {
  return platformFetch<AdminAuctionRow>(`/admin/auctions/${encodeURIComponent(listingId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export interface PlatformMonitoringSnapshot {
  generatedAt: string;
  counts: {
    stuckPendingOrders: number;
    pendingPayments: number;
    failedPayments: number;
    recentAuthFailures: number;
    ledgerJournals: number;
    sellerPayableCents: number;
    openReturns?: number;
    failedPayouts?: number;
  };
  alerts: string[];
}

export interface PlatformDisputeRow {
  id: string;
  orderId: string;
  openedBy: string;
  reason: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  evidence?: Array<{ id: string; note: string; createdAt: string; actorId: string }>;
}

export interface PlatformPayoutRow {
  id: string;
  sellerId: string;
  amountCents: number;
  platformFeeCents: number;
  status: string;
  scheduleAt: string;
  paidAt?: string;
  createdAt: string;
  memo: string;
}

export function apiGetPlatformMonitoring() {
  return platformFetch<PlatformMonitoringSnapshot>('/platform/monitoring');
}

export function apiGetPlatformDisputes() {
  return platformFetch<PlatformDisputeRow[]>('/platform/disputes');
}

export function apiResolvePlatformDispute(
  disputeId: string,
  resolution: 'resolved_buyer' | 'resolved_seller' | 'closed'
) {
  return platformFetch<PlatformDisputeRow>(`/platform/disputes/${encodeURIComponent(disputeId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ resolution }),
  });
}

export async function apiGetPlatformPayouts(sellerId?: string) {
  return platformFetch<PlatformPayoutRow[]>('/platform/payouts', {
    query: sellerId ? { sellerId } : undefined,
  });
}

export interface SellerPayoutSummary {
  sellerId: string;
  availableCents: number;
  pendingCents: number;
  paidCents: number;
  nextPayoutDate: string | null;
  payouts: PlatformPayoutRow[];
}

export async function apiGetSellerPayoutSummary(sellerId?: string) {
  return platformFetch<SellerPayoutSummary>('/platform/payouts/summary', {
    query: sellerId ? { sellerId } : undefined,
  });
}

export function apiSchedulePlatformPayout(input: {
  sellerId: string;
  amountCents: number;
  memo?: string;
}) {
  return platformFetch<PlatformPayoutRow>('/platform/payouts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function apiRunPlatformJobs() {
  return platformFetch<{ ok: boolean; processed: number }>('/platform/jobs/run', {
    method: 'POST',
  });
}

export function apiGetPlatformReturns() {
  return platformFetch<
    Array<{
      id: string;
      orderId: string;
      buyerId: string;
      reason: string;
      status: string;
      rmaCode: string;
      createdAt: string;
    }>
  >('/platform/returns');
}

export function apiTransitionPlatformReturn(
  returnId: string,
  input: { action: string; notes?: string }
) {
  return platformFetch(`/platform/returns/${encodeURIComponent(returnId)}/transitions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
