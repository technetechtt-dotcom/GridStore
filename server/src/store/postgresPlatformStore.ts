import bcrypt from 'bcryptjs';
import { seedProducts } from '../data/seed.js';
import { requireSql } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { createId, inferRoleFromEmail, nowLabel } from '../lib/ids.js';
import { matchesQuery } from '../lib/search.js';
import { signToken } from '../lib/tokens.js';
import type {
  AppUser,
  AuthUser,
  Order,
  OrderLine,
  SellerListing,
  StoredUser,
  UserRole,
} from '../types.js';
import type { CreateOrderInput, ListingInput, PlatformStore } from './storeTypes.js';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  verified: boolean;
  password_hash: string;
}

interface OrderRow {
  id: string;
  user_id: string;
  status: Order['status'];
  payment_status: Order['paymentStatus'];
  total: string | number;
  delivery_address: string;
  receipt_number: string;
  created_at: string;
}

interface OrderLineRow {
  order_id: string;
  product_id: string;
  title: string;
  seller: string;
  quantity: number;
  unit_price: string | number;
}

interface ListingRow {
  id: string;
  seller_id: string;
  title: string;
  category: string;
  price: string | number;
  rating: string | number;
  reviews: number;
  seller: string;
  location: string;
  badge: string | null;
  image: string;
  description: string;
  status: SellerListing['status'];
  inventory: number;
  risk_score: number;
  verified: boolean;
}

function rowToStoredUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    verified: row.verified,
    passwordHash: row.password_hash,
  };
}

function rowToListing(row: ListingRow): SellerListing {
  return {
    id: row.id,
    sellerId: row.seller_id,
    title: row.title,
    category: row.category,
    price: Number(row.price),
    rating: Number(row.rating),
    reviews: row.reviews,
    seller: row.seller,
    location: row.location,
    badge: row.badge ?? undefined,
    image: row.image,
    description: row.description,
    status: row.status,
    inventory: row.inventory,
    riskScore: row.risk_score,
    verified: row.verified,
  };
}

export class PostgresPlatformStore implements PlatformStore {
  private users = new Map<string, StoredUser>();
  private orders: Order[] = [];
  private listings: SellerListing[] = [];
  private ready = false;

  async ensureSeeded() {
    if (this.ready) return;
    await migrate();

    const db = requireSql();
    const userRows = (await db`SELECT * FROM gridstore_users`) as UserRow[];
    userRows.forEach((row) => this.users.set(row.id, rowToStoredUser(row)));

    const orderRows = (await db`SELECT * FROM gridstore_orders ORDER BY created_at DESC`) as OrderRow[];
    const lineRows = (await db`SELECT * FROM gridstore_order_lines`) as OrderLineRow[];
    const linesByOrder = new Map<string, OrderLine[]>();
    lineRows.forEach((line) => {
      const existing = linesByOrder.get(line.order_id) ?? [];
      existing.push({
        productId: line.product_id,
        title: line.title,
        seller: line.seller,
        quantity: line.quantity,
        unitPrice: Number(line.unit_price),
      });
      linesByOrder.set(line.order_id, existing);
    });

    this.orders = orderRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      status: row.status,
      paymentStatus: row.payment_status,
      total: Number(row.total),
      deliveryAddress: row.delivery_address,
      receiptNumber: row.receipt_number,
      createdAt: row.created_at,
      lines: linesByOrder.get(row.id) ?? [],
    }));

    const listingRows = (await db`SELECT * FROM gridstore_listings`) as ListingRow[];
    this.listings = listingRows.map(rowToListing);

    if (this.users.size === 0) {
      await this.seedDemoData();
    }

    this.ready = true;
  }

  private async seedDemoData() {
    const db = requireSql();
    const demoPassword = await bcrypt.hash('demo1234', 10);

    const seller: StoredUser = {
      id: 'user-demo-seller',
      name: 'Demo Seller',
      email: 'seller@gridstore.local',
      role: 'seller',
      verified: true,
      passwordHash: demoPassword,
    };

    const buyer: StoredUser = {
      id: 'user-demo-buyer',
      name: 'Demo Buyer',
      email: 'buyer@gridstore.local',
      role: 'buyer',
      verified: true,
      passwordHash: demoPassword,
    };

    for (const user of [seller, buyer]) {
      await db`
        INSERT INTO gridstore_users (id, name, email, role, verified, password_hash)
        VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.verified}, ${user.passwordHash})
      `;
      this.users.set(user.id, user);
    }

    this.listings = seedProducts.slice(0, 3).map((product, index) => ({
      ...product,
      sellerId: seller.id,
      status: index === 2 ? 'paused' : 'active',
      inventory: [8, 4, 2][index] ?? 1,
      riskScore: [9, 12, 18][index] ?? 10,
      verified: true,
    }));

    for (const listing of this.listings) {
      await db`
        INSERT INTO gridstore_listings (
          id, seller_id, title, category, price, rating, reviews, seller, location,
          badge, image, description, status, inventory, risk_score, verified
        ) VALUES (
          ${listing.id}, ${listing.sellerId}, ${listing.title}, ${listing.category},
          ${listing.price}, ${listing.rating}, ${listing.reviews}, ${listing.seller},
          ${listing.location}, ${listing.badge ?? null}, ${listing.image},
          ${listing.description}, ${listing.status}, ${listing.inventory},
          ${listing.riskScore}, ${listing.verified}
        )
      `;
    }
  }

  private cacheUser(user: StoredUser) {
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

    const user = this.cacheUser({
      id: createId('user'),
      name: name.trim(),
      email: email.trim(),
      role,
      verified: false,
      passwordHash: await bcrypt.hash(password, 10),
    });

    const db = requireSql();
    await db`
      INSERT INTO gridstore_users (id, name, email, role, verified, password_hash)
      VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.verified}, ${user.passwordHash})
    `;

    return this.toAuthUser(user);
  }

  async login(email: string, password: string, role: UserRole = 'buyer'): Promise<AuthUser> {
    await this.ensureSeeded();
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    let user = this.getUserByEmail(email);
    if (!user) {
      user = this.cacheUser({
        id: createId('user'),
        name: inferRoleFromEmail(email, role) === 'seller' ? 'Seller Account' : 'Buyer Account',
        email: email.trim(),
        role: inferRoleFromEmail(email, role),
        verified: true,
        passwordHash: await bcrypt.hash(password, 10),
      });

      const db = requireSql();
      await db`
        INSERT INTO gridstore_users (id, name, email, role, verified, password_hash)
        VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.verified}, ${user.passwordHash})
      `;
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
      user = this.cacheUser({
        id: createId(provider),
        name: `${provider === 'google' ? 'Google' : 'GitHub'} User`,
        email,
        role,
        verified: true,
        passwordHash: '',
      });

      const db = requireSql();
      await db`
        INSERT INTO gridstore_users (id, name, email, role, verified, password_hash)
        VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.verified}, ${user.passwordHash})
      `;
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

    const db = requireSql();
    await db`
      UPDATE gridstore_users
      SET name = ${user.name}, email = ${user.email}
      WHERE id = ${userId}
    `;

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

    const db = requireSql();
    await db`
      INSERT INTO gridstore_orders (
        id, user_id, status, payment_status, total, delivery_address, receipt_number, created_at
      ) VALUES (
        ${order.id}, ${order.userId}, ${order.status}, ${order.paymentStatus},
        ${order.total}, ${order.deliveryAddress}, ${order.receiptNumber}, ${order.createdAt}
      )
    `;

    for (const line of order.lines) {
      await db`
        INSERT INTO gridstore_order_lines (
          order_id, product_id, title, seller, quantity, unit_price
        ) VALUES (
          ${order.id}, ${line.productId}, ${line.title}, ${line.seller},
          ${line.quantity}, ${line.unitPrice}
        )
      `;
    }

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

    const db = requireSql();
    await db`
      UPDATE gridstore_orders
      SET status = ${order.status}, payment_status = ${order.paymentStatus}
      WHERE id = ${orderId} AND user_id = ${userId}
    `;

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

    const db = requireSql();
    await db`
      INSERT INTO gridstore_listings (
        id, seller_id, title, category, price, rating, reviews, seller, location,
        badge, image, description, status, inventory, risk_score, verified
      ) VALUES (
        ${listing.id}, ${listing.sellerId}, ${listing.title}, ${listing.category},
        ${listing.price}, ${listing.rating}, ${listing.reviews}, ${listing.seller},
        ${listing.location}, ${listing.badge ?? null}, ${listing.image},
        ${listing.description}, ${listing.status}, ${listing.inventory},
        ${listing.riskScore}, ${listing.verified}
      )
    `;

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

    const db = requireSql();
    await db`
      UPDATE gridstore_listings
      SET
        title = ${listing.title},
        category = ${listing.category},
        price = ${listing.price},
        inventory = ${listing.inventory},
        description = ${listing.description},
        location = ${listing.location},
        status = ${listing.status}
      WHERE id = ${listingId} AND seller_id = ${userId}
    `;

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

    const db = requireSql();
    await db`
      UPDATE gridstore_listings
      SET status = ${listing.status}
      WHERE id = ${listingId} AND seller_id = ${userId}
    `;

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
