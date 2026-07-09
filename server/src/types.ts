export interface Product {
  id: string;
  title: string;
  category: string;
  price: number;
  rating: number;
  reviews: number;
  seller: string;
  location: string;
  badge?: string;
  image: string;
  description: string;
  status?: CatalogItemStatus;
}

export type CatalogItemStatus = 'active' | 'paused' | 'flagged';

export interface Service {
  id: string;
  title: string;
  provider: string;
  category: string;
  priceLabel: string;
  rating: number;
  location: string;
  image: string;
  description: string;
  status?: CatalogItemStatus;
}

export interface Rental {
  id: string;
  title: string;
  owner: string;
  category: string;
  dailyRate: number;
  location: string;
  image: string;
  description: string;
  status?: CatalogItemStatus;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salaryLabel: string;
  type: string;
  description: string;
  status?: CatalogItemStatus;
}

export interface StoreProfile {
  id: string;
  name: string;
  category: string;
  rating: number;
  followers: number;
  location: string;
  description: string;
  supportEmail?: string;
  status?: 'active' | 'draft' | 'paused';
  verified?: boolean;
  image?: string;
}

export type UserRole = 'buyer' | 'seller' | 'moderator' | 'admin';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  verified: boolean;
}

export interface AuthUser extends AppUser {
  sessionToken: string;
}

export interface OrderLine {
  productId: string;
  title: string;
  seller: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  userId: string;
  status: 'pending_payment' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'refunded';
  paymentStatus: 'requires_provider' | 'authorized' | 'paid' | 'refunded';
  total: number;
  deliveryAddress: string;
  receiptNumber: string;
  createdAt: string;
  lines: OrderLine[];
}

export interface SellerListing extends Product {
  sellerId: string;
  status: 'active' | 'draft' | 'paused' | 'flagged';
  inventory: number;
  riskScore: number;
  verified: boolean;
  saleMode: 'fixed' | 'haggle' | 'auction';
  haggleEnabled: boolean;
  startingBid?: number;
  currentBid?: number;
  bidIncrement?: number;
  reservePrice?: number;
  auctionEndsAt?: string;
  auctionStatus: 'none' | 'live' | 'ended';
  bidCount: number;
}

export interface HaggleOffer {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerId: string;
  buyerName: string;
  amount: number;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'countered' | 'withdrawn';
  counterAmount?: number;
  createdAt: string;
}

export interface AuctionBid {
  id: string;
  listingId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  createdAt: string;
}

export interface StoredUser extends AppUser {
  passwordHash: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  unread: boolean;
}

export interface MessageItem {
  id: string;
  author: 'buyer' | 'seller';
  text: string;
  createdAt: string;
}

export interface MessageThread {
  id: string;
  title: string;
  participant: string;
  messages: MessageItem[];
}

export interface BookingRequest {
  id: string;
  userId: string;
  serviceId: string;
  serviceTitle: string;
  provider: string;
  requestedDate: string;
  note: string;
  status: 'requested' | 'quoted' | 'confirmed';
  createdAt: string;
}

export interface RentalReservation {
  id: string;
  userId: string;
  rentalId: string;
  rentalTitle: string;
  startDate: string;
  endDate: string;
  status: 'requested' | 'confirmed' | 'unavailable';
  createdAt: string;
}

export interface JobApplication {
  id: string;
  userId: string;
  jobId: string;
  jobTitle: string;
  applicantName: string;
  cvFileName: string;
  status: 'submitted' | 'reviewing' | 'shortlisted';
  createdAt: string;
}

export interface TrustReport {
  id: string;
  userId: string;
  targetType: 'listing' | 'user' | 'order';
  targetId: string;
  reason: string;
  status: 'open' | 'in_review' | 'resolved';
  createdAt: string;
}

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
