import bcrypt from 'bcryptjs';
import { seedProducts } from '../data/seed.js';
import { requireSql } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { resolveSaleFields } from '../lib/listingSale.js';
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

function rowToListing(row: ListingRow & Record<string, unknown>): SellerListing {
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
    saleMode: (row.sale_mode as SellerListing['saleMode']) ?? 'fixed',
    haggleEnabled: Boolean(row.haggle_enabled),
    startingBid: row.starting_bid != null ? Number(row.starting_bid) : undefined,
    currentBid: row.current_bid != null ? Number(row.current_bid) : undefined,
    bidIncrement: row.bid_increment != null ? Number(row.bid_increment) : undefined,
    reservePrice: row.reserve_price != null ? Number(row.reserve_price) : undefined,
    auctionEndsAt: row.auction_ends_at ? String(row.auction_ends_at) : undefined,
    auctionStatus: (row.auction_status as SellerListing['auctionStatus']) ?? 'none',
    bidCount: Number(row.bid_count ?? 0),
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
    } else {
      await this.ensureAdminUser();
    }

    this.ready = true;
  }

  private async ensureAdminUser() {
    if (this.getUserByEmail('admin@gridstore.local')) return;

    const db = requireSql();
    const demoPassword = await bcrypt.hash('demo1234', 10);
    const admin: StoredUser = {
      id: 'user-demo-admin',
      name: 'Demo Admin',
      email: 'admin@gridstore.local',
      role: 'admin',
      verified: true,
      passwordHash: demoPassword,
    };

    await db`
      INSERT INTO gridstore_users (id, name, email, role, verified, password_hash)
      VALUES (${admin.id}, ${admin.name}, ${admin.email}, ${admin.role}, ${admin.verified}, ${admin.passwordHash})
      ON CONFLICT (email) DO NOTHING
    `;
    this.users.set(admin.id, admin);
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

    const admin: StoredUser = {
      id: 'user-demo-admin',
      name: 'Demo Admin',
      email: 'admin@gridstore.local',
      role: 'admin',
      verified: true,
      passwordHash: demoPassword,
    };

    for (const user of [seller, buyer, admin]) {
      await db`
        INSERT INTO gridstore_users (id, name, email, role, verified, password_hash)
        VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.verified}, ${user.passwordHash})
      `;
      this.users.set(user.id, user);
    }

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

    for (const listing of this.listings) {
      await db`
        INSERT INTO gridstore_listings (
          id, seller_id, title, category, price, rating, reviews, seller, location,
          badge, image, description, status, inventory, risk_score, verified,
          sale_mode, haggle_enabled, starting_bid, current_bid, bid_increment,
          reserve_price, auction_ends_at, auction_status, bid_count
        ) VALUES (
          ${listing.id}, ${listing.sellerId}, ${listing.title}, ${listing.category},
          ${listing.price}, ${listing.rating}, ${listing.reviews}, ${listing.seller},
          ${listing.location}, ${listing.badge ?? null}, ${listing.image},
          ${listing.description}, ${listing.status}, ${listing.inventory},
          ${listing.riskScore}, ${listing.verified}, ${listing.saleMode ?? 'fixed'},
          ${listing.haggleEnabled ?? false}, ${listing.startingBid ?? null},
          ${listing.currentBid ?? null}, ${listing.bidIncrement ?? null},
          ${listing.reservePrice ?? null}, ${listing.auctionEndsAt ?? null},
          ${listing.auctionStatus ?? 'none'}, ${listing.bidCount ?? 0}
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

  getOrder(userId: string, orderId: string) {
    return this.orders.find((order) => order.id === orderId && order.userId === userId);
  }

  async updateOrderStatus(userId: string, orderId: string, status: Order['status']) {
    const order = this.getOrder(userId, orderId);
    if (!order) {
      throw new Error('Order not found');
    }
    order.status = status;

    const db = requireSql();
    await db`
      UPDATE gridstore_orders SET status = ${status}
      WHERE id = ${orderId} AND user_id = ${userId}
    `;
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
      ...resolveSaleFields(input),
    };

    const db = requireSql();
    await db`
      INSERT INTO gridstore_listings (
        id, seller_id, title, category, price, rating, reviews, seller, location,
        badge, image, description, status, inventory, risk_score, verified,
        sale_mode, haggle_enabled, starting_bid, current_bid, bid_increment,
        reserve_price, auction_ends_at, auction_status, bid_count
      ) VALUES (
        ${listing.id}, ${listing.sellerId}, ${listing.title}, ${listing.category},
        ${listing.price}, ${listing.rating}, ${listing.reviews}, ${listing.seller},
        ${listing.location}, ${listing.badge ?? null}, ${listing.image},
        ${listing.description}, ${listing.status}, ${listing.inventory},
        ${listing.riskScore}, ${listing.verified}, ${listing.saleMode}, ${listing.haggleEnabled},
        ${listing.startingBid ?? null}, ${listing.currentBid ?? null}, ${listing.bidIncrement ?? null},
        ${listing.reservePrice ?? null}, ${listing.auctionEndsAt ?? null}, ${listing.auctionStatus},
        ${listing.bidCount}
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
    if (input.haggleEnabled !== undefined) {
      listing.haggleEnabled = input.haggleEnabled;
      listing.saleMode = input.haggleEnabled ? 'haggle' : listing.saleMode === 'haggle' ? 'fixed' : listing.saleMode;
    }
    if (input.saleMode !== undefined) {
      Object.assign(
        listing,
        resolveSaleFields({
          ...input,
          price: listing.price,
          title: listing.title,
          category: listing.category,
          inventory: listing.inventory,
          description: listing.description,
          location: listing.location,
        })
      );
    }

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
        status = ${listing.status},
        sale_mode = ${listing.saleMode},
        haggle_enabled = ${listing.haggleEnabled},
        starting_bid = ${listing.startingBid ?? null},
        current_bid = ${listing.currentBid ?? null},
        bid_increment = ${listing.bidIncrement ?? null},
        reserve_price = ${listing.reservePrice ?? null},
        auction_ends_at = ${listing.auctionEndsAt ?? null},
        auction_status = ${listing.auctionStatus},
        bid_count = ${listing.bidCount}
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

  listAllUsers() {
    return Array.from(this.users.values()).map((user) => this.toPublicUser(user));
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

    const db = requireSql();
    await db`
      UPDATE gridstore_users
      SET role = ${user.role}, verified = ${user.verified}
      WHERE id = ${userId}
    `;
    return this.toPublicUser(user);
  }

  async adminUpdateListingStatus(listingId: string, status: SellerListing['status']) {
    const listing = this.listings.find((item) => item.id === listingId);
    if (!listing) {
      throw new Error('Listing not found');
    }
    listing.status = status;

    const db = requireSql();
    await db`UPDATE gridstore_listings SET status = ${status} WHERE id = ${listingId}`;
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

    const db = requireSql();
    await db`
      UPDATE gridstore_orders
      SET status = ${order.status}, payment_status = ${order.paymentStatus}
      WHERE id = ${orderId}
    `;

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
      const db = requireSql();
      await db`UPDATE gridstore_listings SET status = ${listing.status} WHERE id = ${listingId}`;
    }
    if (patch.auctionStatus !== undefined) {
      await this.updateListingTradeFields(listingId, { auctionStatus: patch.auctionStatus });
    }
    const refreshed = this.listings.find((item) => item.id === listingId);
    if (!refreshed) throw new Error('Auction not found');
    return refreshed;
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

    const db = requireSql();
    await db`
      UPDATE gridstore_listings
      SET
        current_bid = ${listing.currentBid ?? null},
        bid_count = ${listing.bidCount},
        auction_status = ${listing.auctionStatus},
        haggle_enabled = ${listing.haggleEnabled},
        sale_mode = ${listing.saleMode}
      WHERE id = ${listingId}
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
