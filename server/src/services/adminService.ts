import { env } from '../config/env.js';
import { requireSql } from '../db/client.js';
import { platformStore } from '../store/index.js';
import { userFeaturesStore } from '../store/userFeatures/index.js';
import type {
  AdminStats,
  AppUser,
  Order,
  SellerListing,
  TrustReport,
  UserRole,
} from '../types.js';

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
  createdAt?: string;
}

export async function getAdminStats(): Promise<AdminStats> {
  const reports = await userFeaturesStore.listAllReports();
  const openReports = reports.filter((report) => report.status === 'open').length;

  if (!env.databaseUrl) {
    const listings = platformStore.listPublicListings('', '');
    const orders = platformStore.listAllOrders();
    const users = platformStore.listAllUsers();
    const revenueTotal = orders
      .filter((order) => order.paymentStatus === 'paid')
      .reduce((sum, order) => sum + order.total, 0);

    return {
      totalUsers: users.length,
      totalOrders: orders.length,
      totalListings: listings.length,
      openReports,
      pendingBookings: 0,
      revenueTotal,
    };
  }

  const db = requireSql();
  const [users, orders, listings, bookings, revenue] = await Promise.all([
    db`SELECT COUNT(*)::int AS count FROM gridstore_users`,
    db`SELECT COUNT(*)::int AS count FROM gridstore_orders`,
    db`SELECT COUNT(*)::int AS count FROM gridstore_listings`,
    db`SELECT COUNT(*)::int AS count FROM gridstore_bookings WHERE status = 'requested'`,
    db`SELECT COALESCE(SUM(total), 0)::float AS total FROM gridstore_orders WHERE payment_status = 'paid'`,
  ]);

  return {
    totalUsers: (users[0] as { count: number }).count,
    totalOrders: (orders[0] as { count: number }).count,
    totalListings: (listings[0] as { count: number }).count,
    openReports,
    pendingBookings: (bookings[0] as { count: number }).count,
    revenueTotal: Number((revenue[0] as { total: number }).total),
  };
}

export async function getAdminAnalytics(): Promise<AdminAnalyticsPoint[]> {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const orders = await listAdminOrders();
  const paidOrders = orders.filter((order) => order.paymentStatus === 'paid');

  if (!paidOrders.length) {
    return months.map((month) => ({ month, revenue: 0, orders: 0 }));
  }

  const bucketSize = Math.max(1, Math.ceil(paidOrders.length / months.length));
  return months.map((month, index) => {
    const slice = paidOrders.slice(index * bucketSize, (index + 1) * bucketSize);
    return {
      month,
      revenue: Number((slice.reduce((sum, order) => sum + order.total, 0) / 1000).toFixed(1)),
      orders: slice.length,
    };
  });
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  return platformStore.listAllUsers();
}

export async function updateAdminUser(
  userId: string,
  patch: { role?: UserRole; verified?: boolean }
): Promise<AppUser> {
  return platformStore.adminUpdateUser(userId, patch);
}

export async function listAdminListings(): Promise<SellerListing[]> {
  return platformStore.listAllListingsAdmin();
}

export async function updateAdminListing(
  listingId: string,
  status: SellerListing['status']
): Promise<SellerListing> {
  return platformStore.adminUpdateListingStatus(listingId, status);
}

export async function listAdminOrders(): Promise<AdminOrderRow[]> {
  return platformStore.listAllOrders();
}

export async function updateAdminOrder(
  orderId: string,
  patch: { status?: Order['status']; paymentStatus?: Order['paymentStatus'] }
): Promise<AdminOrderRow> {
  return platformStore.adminUpdateOrder(orderId, patch);
}

export async function listAdminPayments(): Promise<AdminPaymentRow[]> {
  const orders = await listAdminOrders();
  return orders.map((order) => ({
    id: order.id,
    reference: order.receiptNumber,
    method: order.paymentStatus === 'requires_provider' ? 'Manual EFT' : 'Card',
    amount: order.total,
    status:
      order.paymentStatus === 'paid'
        ? 'Settled'
        : order.paymentStatus === 'authorized'
          ? 'Authorized'
          : order.paymentStatus === 'refunded'
            ? 'Refunded'
            : 'Pending',
    buyer: order.buyerName,
    createdAt: order.createdAt,
  }));
}

export async function listAdminReports(): Promise<TrustReport[]> {
  return userFeaturesStore.listAllReports();
}

export async function updateAdminReport(
  reportId: string,
  status: TrustReport['status']
): Promise<TrustReport> {
  return userFeaturesStore.updateReportStatus(reportId, status);
}
