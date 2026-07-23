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
