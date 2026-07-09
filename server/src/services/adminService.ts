import { env } from '../config/env.js';
import { requireSql } from '../db/client.js';
import { isAuctionLive } from '../lib/listingSale.js';
import { catalogStore } from '../store/catalogStore.js';
import { platformStore } from '../store/index.js';
import { storesStore } from '../store/stores/index.js';
import { userFeaturesStore } from '../store/userFeatures/index.js';
import type {
  AdminAuctionRow,
  AdminStats,
  AdminStoreRow,
  AppUser,
  CatalogItemStatus,
  Job,
  Order,
  Product,
  Rental,
  SellerListing,
  Service,
  StoreProfile,
  TrustReport,
  UserRole,
} from '../types.js';
import type { AdminStorePatch } from '../store/stores/types.js';

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
      totalStores: await storesStore.countStores(),
      totalMarketplaceProducts: catalogStore.countProducts(),
      totalServices: catalogStore.countServices(),
      totalRentals: catalogStore.countRentals(),
      totalJobs: catalogStore.countJobs(),
      liveAuctions: platformStore.listAuctionListings().length,
      openReports,
      pendingBookings: 0,
      revenueTotal,
    };
  }

  const db = requireSql();
  const [users, orders, listings, stores, bookings, revenue] = await Promise.all([
    db`SELECT COUNT(*)::int AS count FROM gridstore_users`,
    db`SELECT COUNT(*)::int AS count FROM gridstore_orders`,
    db`SELECT COUNT(*)::int AS count FROM gridstore_listings`,
    db`SELECT COUNT(*)::int AS count FROM gridstore_stores`,
    db`SELECT COUNT(*)::int AS count FROM gridstore_bookings WHERE status = 'requested'`,
    db`SELECT COALESCE(SUM(total), 0)::float AS total FROM gridstore_orders WHERE payment_status = 'paid'`,
  ]);

  return {
    totalUsers: (users[0] as { count: number }).count,
    totalOrders: (orders[0] as { count: number }).count,
    totalListings: (listings[0] as { count: number }).count,
    totalStores: (stores[0] as { count: number }).count,
    totalMarketplaceProducts: catalogStore.countProducts(),
    totalServices: catalogStore.countServices(),
    totalRentals: catalogStore.countRentals(),
    totalJobs: catalogStore.countJobs(),
    liveAuctions: platformStore.listAuctionListings().length,
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

function toAdminStoreRow(
  store: StoreProfile & { ownerId: string; createdAt?: string }
): AdminStoreRow {
  const owner = platformStore.getUserById(store.ownerId);
  return {
    id: store.id,
    name: store.name,
    category: store.category,
    rating: store.rating,
    followers: store.followers,
    location: store.location,
    description: store.description,
    supportEmail: store.supportEmail,
    status: store.status,
    verified: store.verified,
    image: store.image,
    ownerId: store.ownerId,
    ownerName: owner?.name ?? 'Unknown seller',
    ownerEmail: owner?.email ?? '',
    createdAt: store.createdAt,
  };
}

export async function listAdminStores(): Promise<AdminStoreRow[]> {
  const stores = await storesStore.listAllStoresAdmin();
  return stores.map(toAdminStoreRow);
}

export async function updateAdminStore(
  storeId: string,
  patch: AdminStorePatch
): Promise<AdminStoreRow> {
  const updated = await storesStore.adminUpdateStore(storeId, patch);
  const record = await storesStore.listAllStoresAdmin();
  const match = record.find((store) => store.id === updated.id);
  if (!match) {
    throw new Error('Store not found');
  }
  return toAdminStoreRow(match);
}

export async function listAdminMarketplaceProducts(): Promise<Product[]> {
  return catalogStore.listAllProductsAdmin();
}

export async function updateAdminMarketplaceProduct(
  productId: string,
  patch: Partial<Product> & { status?: CatalogItemStatus }
): Promise<Product> {
  return catalogStore.updateProductAdmin(productId, patch);
}

export async function listAdminServices(): Promise<Service[]> {
  return catalogStore.listAllServicesAdmin();
}

export async function updateAdminService(
  serviceId: string,
  patch: Partial<Service> & { status?: CatalogItemStatus }
): Promise<Service> {
  return catalogStore.updateServiceAdmin(serviceId, patch);
}

export async function listAdminRentals(): Promise<Rental[]> {
  return catalogStore.listAllRentalsAdmin();
}

export async function updateAdminRental(
  rentalId: string,
  patch: Partial<Rental> & { status?: CatalogItemStatus }
): Promise<Rental> {
  return catalogStore.updateRentalAdmin(rentalId, patch);
}

export async function listAdminJobs(): Promise<Job[]> {
  return catalogStore.listAllJobsAdmin();
}

export async function updateAdminJob(
  jobId: string,
  patch: Partial<Job> & { status?: CatalogItemStatus }
): Promise<Job> {
  return catalogStore.updateJobAdmin(jobId, patch);
}

export async function listAdminAuctions(): Promise<AdminAuctionRow[]> {
  return platformStore.listAllAuctionsAdmin().map((listing) => {
    const seller = platformStore.getUserById(listing.sellerId);
    return {
      ...listing,
      sellerName: seller?.name ?? listing.seller,
      isLive: isAuctionLive(listing),
    };
  });
}

export async function updateAdminAuction(
  listingId: string,
  patch: { status?: SellerListing['status']; auctionStatus?: SellerListing['auctionStatus'] }
): Promise<AdminAuctionRow> {
  const updated = await platformStore.adminUpdateAuction(listingId, patch);
  const seller = platformStore.getUserById(updated.sellerId);
  return {
    ...updated,
    sellerName: seller?.name ?? updated.seller,
    isLive: isAuctionLive(updated),
  };
}
