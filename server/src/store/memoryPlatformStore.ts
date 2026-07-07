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
    });

    this.createStoredUser({
      id: 'user-demo-buyer',
      name: 'Demo Buyer',
      email: 'buyer@gridstore.local',
      role: 'buyer',
      verified: true,
      passwordHash: demoPassword,
    });

    this.listings = seedProducts.slice(0, 3).map((product, index) => ({
      ...product,
      sellerId: seller.id,
      status: index === 2 ? 'paused' : 'active',
      inventory: [8, 4, 2][index] ?? 1,
      riskScore: [9, 12, 18][index] ?? 10,
      verified: true,
    }));
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
    const normalized = email.trim().toLowerCase();
    return Array.from(this.users.values()).find(
      (user) => user.email.toLowerCase() === normalized
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

  private toAuthUser(user: StoredUser): AuthUser {
    const publicUser = this.toPublicUser(user);
    return {
      ...publicUser,
      sessionToken: signToken(publicUser),
    };
  }
}
