import type {
  AdminUserRow,
  AppUser,
  AuthUser,
  Order,
  OrderLine,
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

export interface PlatformStore {
  ensureSeeded(): Promise<void>;
  toPublicUser(user: StoredUser): AppUser;
  getUserById(id: string): StoredUser | undefined;
  getUserByEmail(email: string): StoredUser | undefined;
  signup(name: string, email: string, password: string, role: UserRole): Promise<AuthUser>;
  login(email: string, password: string, role?: UserRole): Promise<AuthUser>;
  oauthLogin(provider: 'google' | 'github', role: UserRole): Promise<AuthUser>;
  updateProfile(userId: string, input: { name: string; email: string }): Promise<AppUser>;
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
}
