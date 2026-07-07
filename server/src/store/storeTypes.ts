import type {
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
}
