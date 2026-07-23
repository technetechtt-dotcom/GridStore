import type {
  AdminUserRow,
  AppUser,
  AuthUser,
  Order,
  OrderLine,
  SellerApplication,
  SellerListing,
  StoredUser,
  UserRole,
} from '../types.js';

export interface ListingInput {
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
}

export interface CreateOrderInput {
  deliveryAddress: string;
  paymentMethod: string;
  lines: OrderLine[];
}

export interface SellerApplicationInput {
  businessName: string;
  category: string;
  location: string;
  description: string;
}

export interface PlatformStore {
  ensureSeeded(): Promise<void>;
  toPublicUser(user: StoredUser): AppUser;
  getUserById(id: string): StoredUser | undefined;
  getUserByEmail(email: string): StoredUser | undefined;
  signup(name: string, email: string, password: string): Promise<AuthUser>;
  login(
    email: string,
    password: string,
    meta?: { ip?: string; userAgent?: string }
  ): Promise<AuthUser>;
  oauthLogin(
    provider: 'google' | 'github',
    meta?: { ip?: string; userAgent?: string }
  ): Promise<AuthUser>;
  requestPasswordReset(email: string): Promise<void>;
  confirmPasswordReset(token: string, password: string): Promise<AuthUser>;
  verifyEmail(token: string): Promise<AppUser>;
  refreshSession(sessionId: string, refreshToken: string): Promise<AuthUser>;
  logoutSession(sessionId: string): Promise<void>;
  logoutAllSessions(userId: string): Promise<number>;
  markEmailVerified(userId: string): Promise<AppUser>;
  updateProfile(userId: string, input: { name: string; email: string }): Promise<AppUser>;
  verifyPassword(userId: string, password: string): Promise<boolean>;
  enableMfa(userId: string, secret: string): Promise<AppUser>;
  confirmMfa(userId: string, token: string): Promise<boolean>;
  isMfaSatisfied(user: StoredUser, token?: string): boolean;
  listOrders(userId: string): Order[];
  getOrder(userId: string, orderId: string): Order | undefined;
  updateOrderStatus(
    userId: string,
    orderId: string,
    status: Order['status']
  ): Promise<Order>;
  createOrder(userId: string, input: CreateOrderInput): Promise<Order>;
  refundOrder(userId: string, orderId: string): Promise<Order>;
  listPublicListings(query?: string, status?: string): SellerListing[];
  listSellerListings(userId: string): SellerListing[];
  getListing(id: string): SellerListing | undefined;
  createListing(
    userId: string,
    sellerName: string,
    verified: boolean,
    input: ListingInput
  ): Promise<SellerListing>;
  updateListing(
    userId: string,
    listingId: string,
    input: Partial<ListingInput>
  ): Promise<SellerListing>;
  toggleListingPause(userId: string, listingId: string): Promise<SellerListing>;
  listAllUsers(): AppUser[];
  listAllUsersAdmin(): AdminUserRow[];
  listAllOrders(): Array<Order & { buyerName: string; buyerEmail: string }>;
  listAllListingsAdmin(): SellerListing[];
  listAllAuctionsAdmin(): SellerListing[];
  adminUpdateUser(userId: string, patch: { role?: UserRole; verified?: boolean }): Promise<AppUser>;
  adminResetUserPassword(userId: string, password: string): Promise<AdminUserRow>;
  adminUpdateListingStatus(listingId: string, status: SellerListing['status']): Promise<SellerListing>;
  adminUpdateAuction(
    listingId: string,
    patch: { status?: SellerListing['status']; auctionStatus?: SellerListing['auctionStatus'] }
  ): Promise<SellerListing>;
  adminUpdateOrder(
    orderId: string,
    patch: { status?: Order['status']; paymentStatus?: Order['paymentStatus'] }
  ): Promise<Order & { buyerName: string; buyerEmail: string }>;
  updateListingTradeFields(
    listingId: string,
    patch: Partial<Pick<SellerListing, 'currentBid' | 'bidCount' | 'auctionStatus' | 'haggleEnabled' | 'saleMode'>>
  ): Promise<SellerListing>;
  listAuctionListings(): SellerListing[];
  createSellerApplication(userId: string, input: SellerApplicationInput): Promise<SellerApplication>;
  getSellerApplication(userId: string): Promise<SellerApplication | undefined>;
  listSellerApplications(): Promise<SellerApplication[]>;
  reviewSellerApplication(
    applicationId: string,
    reviewerId: string,
    decision: 'approved' | 'rejected'
  ): Promise<SellerApplication>;
}
