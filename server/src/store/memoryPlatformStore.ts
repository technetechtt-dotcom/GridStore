import bcrypt from 'bcryptjs';
import { seedProducts } from '../data/seed.js';
import { createId, inferRoleFromEmail, nowLabel } from '../lib/ids.js';
import { matchesQuery } from '../lib/search.js';
import { signToken } from '../lib/tokens.js';
import type {
  AppUser,
  AuthUser,
  Order,
  SellerListing,
  StoredUser,
  UserRole,
} from '../types.js';
import type { CreateOrderInput, ListingInput, PlatformStore } from './storeTypes.js';
import { resolveSaleFields } from '../lib/listingSale.js';

export class MemoryPlatformStore implements PlatformStore {
  private users = new Map<string, StoredUser>();
  private orders: Order[] = [];
  private listings: SellerListing[] = [];
  private seeded = false;

  async ensureSeeded() {
    if (this.seeded) return;
    this.seeded = true;

    const demoPassword = await bcrypt.hash('demo1234', 10);

    const seller = this.createStoredUser({
      id: 'user-demo-seller',
      name: 'Demo Seller',
      email: 'seller@gridstore.local',
      role: 'seller',
      verified: true,
      passwordHash: demoPassword,
      passwordPlaintext: 'demo1234',
    });

    this.createStoredUser({
      id: 'user-demo-buyer',
      name: 'Demo Buyer',
      email: 'buyer@gridstore.local',
      role: 'buyer',
      verified: true,
      passwordHash: demoPassword,
      passwordPlaintext: 'demo1234',
    });

    this.createStoredUser({
      id: 'user-demo-admin',
      name: 'Demo Admin',
      email: 'admin@gridstore.local',
      role: 'admin',
      verified: true,
      passwordHash: demoPassword,
      passwordPlaintext: 'demo1234',
    });

    this.listings = seedProducts.slice(0, 3).map((product, index) => {
      const base = {
        ...product,
        sellerId: seller.id,
        status: (index === 2 ? 'paused' : 'active') as SellerListing['status'],
        inventory: [8, 4, 2][index] ?? 1,
        riskScore: [9, 12, 18][index] ?? 10,
        verified: true,
      };

      if (index === 0) {
        return {
          ...base,
          ...resolveSaleFields({
            title: product.title,
            category: product.category,
            price: product.price,
            inventory: base.inventory,
            description: product.description,
            location: product.location,
            saleMode: 'auction',
            startingBid: Math.round(product.price * 0.6),
            bidIncrement: 100,
            auctionDurationHours: 72,
          }),
        };
      }

      if (index === 1) {
        return {
          ...base,
          ...resolveSaleFields({
            title: product.title,
            category: product.category,
            price: product.price,
            inventory: base.inventory,
            description: product.description,
            location: product.location,
            saleMode: 'haggle',
            haggleEnabled: true,
          }),
        };
      }

      return {
        ...base,
        ...resolveSaleFields({
          title: product.title,
          category: product.category,
          price: product.price,
          inventory: base.inventory,
          description: product.description,
          location: product.location,
        }),
      };
    });
  }

  private createStoredUser(user: StoredUser) {
    this.users.set(user.id, user);
    return user;
  }

  toPublicUser(user: StoredUser): AppUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      verified: user.verified,
    };
  }

  getUserById(id: string) {
    return this.users.get(id);
  }

  getUserByEmail(email: string) {
    if (!email?.trim()) return undefined;
    const normalized = email.trim().toLowerCase();
    return Array.from(this.users.values()).find(
      (user) => user.email?.toLowerCase() === normalized
    );
  }

  async signup(name: string, email: string, password: string, role: UserRole): Promise<AuthUser> {
    await this.ensureSeeded();
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    if (this.getUserByEmail(email)) {
      throw new Error('An account with this email already exists');
    }

    const user = this.createStoredUser({
      id: createId('user'),
      name: name.trim(),
      email: email.trim(),
      role,
      verified: false,
      passwordHash: await bcrypt.hash(password, 10),
      passwordPlaintext: password,
    });

    return this.toAuthUser(user);
  }

  async login(email: string, password: string, role: UserRole = 'buyer'): Promise<AuthUser> {
    await this.ensureSeeded();
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    let user = this.getUserByEmail(email);
    if (!user) {
      user = this.createStoredUser({
        id: createId('user'),
        name: inferRoleFromEmail(email, role) === 'seller' ? 'Seller Account' : 'Buyer Account',
        email: email.trim(),
        role: inferRoleFromEmail(email, role),
        verified: true,
        passwordHash: await bcrypt.hash(password, 10),
        passwordPlaintext: password,
      });
    } else {
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        throw new Error('Invalid email or password');
      }
    }

    return this.toAuthUser(user);
  }

  async oauthLogin(provider: 'google' | 'github', role: UserRole): Promise<AuthUser> {
    await this.ensureSeeded();
    const email = `${provider}.user@gridstore.local`;
    let user = this.getUserByEmail(email);
    if (!user) {
      user = this.createStoredUser({
        id: createId(provider),
        name: `${provider === 'google' ? 'Google' : 'GitHub'} User`,
        email,
        role,
        verified: true,
        passwordHash: '',
      });
    }
    return this.toAuthUser(user);
  }

  async updateProfile(userId: string, input: { name: string; email: string }): Promise<AppUser> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    if (!input.email.includes('@')) {
      throw new Error('Enter a valid email address');
    }
    const existing = this.getUserByEmail(input.email);
    if (existing && existing.id !== userId) {
      throw new Error('Email is already in use');
    }

    user.name = input.name.trim();
    user.email = input.email.trim();
    return this.toPublicUser(user);
  }

  listOrders(userId: string) {
    return this.orders
      .filter((order) => order.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getOrder(userId: string, orderId: string) {
    return this.orders.find((order) => order.id === orderId && order.userId === userId);
  }

  async updateOrderStatus(userId: string, orderId: string, status: Order['status']) {
    const order = this.getOrder(userId, orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    order.status = status;
    return order;
  }

  async createOrder(userId: string, input: CreateOrderInput): Promise<Order> {
    if (!input.lines.length) {
      throw new Error('Cart is empty');
    }
    if (!input.deliveryAddress.trim()) {
      throw new Error('Delivery address is required');
    }

    const total = input.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice,
      0
    );

    const order: Order = {
      id: createId('ord'),
      userId,
      status: input.paymentMethod === 'manual_eft' ? 'pending_payment' : 'paid',
      paymentStatus: input.paymentMethod === 'manual_eft' ? 'requires_provider' : 'paid',
      total,
      deliveryAddress: input.deliveryAddress.trim(),
      receiptNumber: `GS-${Date.now().toString().slice(-8)}`,
      createdAt: nowLabel(),
      lines: input.lines,
    };

    this.orders.unshift(order);
    return order;
  }

  async refundOrder(userId: string, orderId: string): Promise<Order> {
    const order = this.orders.find((item) => item.id === orderId && item.userId === userId);
    if (!order) {
      throw new Error('Order not found');
    }
    order.status = 'refunded';
    order.paymentStatus = 'refunded';
    return order;
  }

  listPublicListings(query = '', status = 'active') {
    return this.listings.filter((listing) => {
      const matchesStatus = !status || listing.status === status;
      const matchesSearch = matchesQuery(
        [listing.title, listing.category, listing.seller, listing.location],
        query
      );
      return matchesStatus && matchesSearch;
    });
  }

  listSellerListings(userId: string) {
    return this.listings.filter((listing) => listing.sellerId === userId);
  }

  getListing(id: string) {
    return this.listings.find((listing) => listing.id === id);
  }

  async createListing(
    userId: string,
    sellerName: string,
    verified: boolean,
    input: ListingInput
  ): Promise<SellerListing> {
    const listing: SellerListing = {
      id: createId('listing'),
      title: input.title,
      category: input.category,
      price: input.price,
      rating: 0,
      reviews: 0,
      seller: sellerName,
      location: input.location,
      image:
        'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&q=80&w=800',
      description: input.description,
      sellerId: userId,
      status: 'draft',
      inventory: input.inventory,
      riskScore: Math.max(3, Math.min(35, Math.round(60 / Math.max(input.inventory, 1)))),
      verified,
      ...resolveSaleFields(input),
    };
    this.listings.unshift(listing);
    return listing;
  }

  async updateListing(userId: string, listingId: string, input: Partial<ListingInput>) {
    const listing = this.listings.find(
      (item) => item.id === listingId && item.sellerId === userId
    );
    if (!listing) {
      throw new Error('Listing not found');
    }

    if (input.title !== undefined) listing.title = input.title;
    if (input.category !== undefined) listing.category = input.category;
    if (input.price !== undefined) listing.price = input.price;
    if (input.inventory !== undefined) {
      listing.inventory = input.inventory;
      if (input.inventory === 0) {
        listing.status = 'paused';
      }
    }
    if (input.description !== undefined) listing.description = input.description;
    if (input.location !== undefined) listing.location = input.location;
    if (input.haggleEnabled !== undefined) {
      listing.haggleEnabled = input.haggleEnabled;
      listing.saleMode = input.haggleEnabled ? 'haggle' : listing.saleMode === 'haggle' ? 'fixed' : listing.saleMode;
    }
    if (input.saleMode !== undefined) {
      Object.assign(listing, resolveSaleFields({ ...input, price: listing.price, title: listing.title, category: listing.category, inventory: listing.inventory, description: listing.description, location: listing.location }));
    }

    return listing;
  }

  async toggleListingPause(userId: string, listingId: string) {
    const listing = this.listings.find(
      (item) => item.id === listingId && item.sellerId === userId
    );
    if (!listing) {
      throw new Error('Listing not found');
    }
    listing.status = listing.status === 'paused' ? 'active' : 'paused';
    return listing;
  }

  listAllUsers() {
    return Array.from(this.users.values()).map((user) => this.toPublicUser(user));
  }

  listAllUsersAdmin() {
    return Array.from(this.users.values()).map((user) => ({
      ...this.toPublicUser(user),
      password: user.passwordPlaintext ?? null,
    }));
  }

  async adminResetUserPassword(userId: string, password: string) {
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordPlaintext = password;
    return {
      ...this.toPublicUser(user),
      password: user.passwordPlaintext,
    };
  }

  listAllOrders() {
    return this.orders.map((order) => {
      const buyer = this.users.get(order.userId);
      return {
        ...order,
        buyerName: buyer?.name ?? 'Unknown',
        buyerEmail: buyer?.email ?? '',
      };
    });
  }

  listAllListingsAdmin() {
    return [...this.listings];
  }

  async adminUpdateUser(userId: string, patch: { role?: UserRole; verified?: boolean }) {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    if (patch.role !== undefined) user.role = patch.role;
    if (patch.verified !== undefined) user.verified = patch.verified;
    return this.toPublicUser(user);
  }

  async adminUpdateListingStatus(listingId: string, status: SellerListing['status']) {
    const listing = this.listings.find((item) => item.id === listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }
    listing.status = status;
    return listing;
  }

  async adminUpdateOrder(
    orderId: string,
    patch: { status?: Order['status']; paymentStatus?: Order['paymentStatus'] }
  ) {
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    if (patch.status !== undefined) order.status = patch.status;
    if (patch.paymentStatus !== undefined) order.paymentStatus = patch.paymentStatus;
    const buyer = this.users.get(order.userId);
    return {
      ...order,
      buyerName: buyer?.name ?? 'Unknown',
      buyerEmail: buyer?.email ?? '',
    };
  }

  listAuctionListings() {
    return this.listings.filter(
      (listing) =>
        listing.saleMode === 'auction' &&
        listing.auctionStatus === 'live' &&
        listing.status === 'active'
    );
  }

  listAllAuctionsAdmin() {
    return this.listings.filter((listing) => listing.saleMode === 'auction');
  }

  async adminUpdateAuction(
    listingId: string,
    patch: { status?: SellerListing['status']; auctionStatus?: SellerListing['auctionStatus'] }
  ) {
    const listing = this.listings.find((item) => item.id === listingId && item.saleMode === 'auction');
    if (!listing) {
      throw new Error('Auction not found');
    }
    if (patch.status !== undefined) {
      listing.status = patch.status;
    }
    if (patch.auctionStatus !== undefined) {
      listing.auctionStatus = patch.auctionStatus;
    }
    return listing;
  }

  async updateListingTradeFields(
    listingId: string,
    patch: Partial<Pick<SellerListing, 'currentBid' | 'bidCount' | 'auctionStatus' | 'haggleEnabled' | 'saleMode'>>
  ) {
    const listing = this.listings.find((item) => item.id === listingId);
    if (!listing) throw new Error('Listing not found');
    if (patch.currentBid !== undefined) listing.currentBid = patch.currentBid;
    if (patch.bidCount !== undefined) listing.bidCount = patch.bidCount;
    if (patch.auctionStatus !== undefined) listing.auctionStatus = patch.auctionStatus;
    if (patch.haggleEnabled !== undefined) listing.haggleEnabled = patch.haggleEnabled;
    if (patch.saleMode !== undefined) listing.saleMode = patch.saleMode;
    return listing;
  }

  private toAuthUser(user: StoredUser): AuthUser {
    const publicUser = this.toPublicUser(user);
    return {
      ...publicUser,
      sessionToken: signToken(publicUser),
    };
  }
}
