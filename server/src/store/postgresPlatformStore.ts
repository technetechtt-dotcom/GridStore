import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { seedProducts } from '../data/seed.js';
import { requireSql } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { DEMO_SEED_PASSWORD, demoListingBadge } from '../lib/demo.js';
import { createId, nowLabel } from '../lib/ids.js';
import {
  assertNotCompromisedPassword,
  assertNotLocked,
  clearLoginFailures,
  consumeAuthToken,
  createAuthToken,
  createSession,
  progressiveDelayMs,
  recordLoginFailure,
  revokeAllUserSessions,
  revokeSession,
  rotateRefreshToken,
  sendTransactionalEmail,
} from '../lib/authSecurity.js';
import { resolveSaleFields } from '../lib/listingSale.js';
import {
  assertOrderTransition,
  buildAuthoritativeLines,
  centsToRands,
  createOrderEvent,
  reservationExpiryIso,
  randsToCents,
  type InventoryAdjustment,
  type InventoryReservation,
  type OrderTransitionAction,
} from '../lib/orderCommerce.js';
import { matchesQuery } from '../lib/search.js';
import { assertPasswordPolicy, generateMfaSecret, verifyTotp } from '../lib/security.js';
import { accessTokenTtlSeconds, signAccessToken } from '../lib/tokens.js';
import type {
  AppUser,
  AuthUser,
  Order,
  OrderEvent,
  OrderLine,
  SellerApplication,
  SellerListing,
  StoredUser,
  UserRole,
} from '../types.js';
import type {
  CreateOrderInput,
  ListingInput,
  PlatformStore,
  SellerApplicationInput,
} from './storeTypes.js';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  verified: boolean;
  password_hash: string;
  must_change_password?: boolean;
  mfa_enabled?: boolean;
  mfa_secret?: string | null;
  created_at?: string;
}

interface OrderRow {
  id: string;
  user_id: string;
  status: Order['status'];
  payment_status: Order['paymentStatus'];
  total: string | number;
  total_cents?: string | number | null;
  delivery_address: string;
  payment_method?: string | null;
  tracking_number?: string | null;
  receipt_number: string;
  created_at: string;
  idempotency_key?: string | null;
}

interface OrderLineRow {
  order_id: string;
  product_id: string;
  title: string;
  seller: string;
  seller_id?: string | null;
  quantity: number;
  unit_price: string | number;
  unit_price_cents?: string | number | null;
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
    mustChangePassword: Boolean(row.must_change_password),
    mfaEnabled: Boolean(row.mfa_enabled),
    mfaSecret: row.mfa_secret ?? null,
  };
}

function rowToAdminUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    verified: row.verified,
    mustChangePassword: Boolean(row.must_change_password),
    mfaEnabled: Boolean(row.mfa_enabled),
    createdAt: row.created_at,
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
  private orderEvents: OrderEvent[] = [];
  private reservations: InventoryReservation[] = [];
  private adjustments: InventoryAdjustment[] = [];
  private idempotency = new Map<string, string>();
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
      const unitPriceCents = Number(line.unit_price_cents ?? randsToCents(Number(line.unit_price)));
      existing.push({
        productId: line.product_id,
        title: line.title,
        seller: line.seller,
        sellerId: line.seller_id ?? undefined,
        quantity: line.quantity,
        unitPrice: Number(line.unit_price),
        unitPriceCents,
      });
      linesByOrder.set(line.order_id, existing);
    });

    this.orders = orderRows.map((row) => {
      const totalCents = Number(row.total_cents ?? randsToCents(Number(row.total)));
      return {
        id: row.id,
        userId: row.user_id,
        status: row.status,
        paymentStatus: row.payment_status,
        total: Number(row.total),
        totalCents,
        deliveryAddress: row.delivery_address,
        paymentMethod: row.payment_method ?? undefined,
        trackingNumber: row.tracking_number ?? undefined,
        receiptNumber: row.receipt_number,
        createdAt: row.created_at,
        lines: linesByOrder.get(row.id) ?? [],
        idempotencyKey: row.idempotency_key ?? undefined,
      };
    });

    const listingRows = (await db`SELECT * FROM gridstore_listings`) as ListingRow[];
    this.listings = listingRows.map(rowToListing);

    if (this.users.size === 0) {
      if (env.enableDemoData) {
        await this.seedDemoData();
      }
    } else if (env.enableDemoData) {
      await this.ensureDemoUsers();
    }

    this.ready = true;
  }

  private async ensureDemoUsers() {
    const db = requireSql();
    const demoPassword = await bcrypt.hash(DEMO_SEED_PASSWORD, 10);

    const admin = this.getUserByEmail('admin@gridstore.local');
    if (admin) return;

    const adminUser: StoredUser = {
      id: 'user-demo-admin',
      name: 'Demo Admin',
      email: 'admin@gridstore.local',
      role: 'admin',
      verified: true,
      passwordHash: demoPassword,
      mustChangePassword: true,
      mfaEnabled: false,
      mfaSecret: null,
    };

    await db`
      INSERT INTO gridstore_users (id, name, email, role, verified, password_hash, must_change_password, mfa_enabled)
      VALUES (${adminUser.id}, ${adminUser.name}, ${adminUser.email}, ${adminUser.role}, ${adminUser.verified}, ${adminUser.passwordHash}, true, false)
      ON CONFLICT (email) DO NOTHING
    `;
    this.users.set(adminUser.id, adminUser);
  }

  private async seedDemoData() {
    const db = requireSql();
    const demoPassword = await bcrypt.hash(DEMO_SEED_PASSWORD, 10);

    const seller: StoredUser = {
      id: 'user-demo-seller',
      name: 'Demo Seller',
      email: 'seller@gridstore.local',
      role: 'seller',
      verified: true,
      passwordHash: demoPassword,
      mustChangePassword: true,
      mfaEnabled: false,
    };

    const buyer: StoredUser = {
      id: 'user-demo-buyer',
      name: 'Demo Buyer',
      email: 'buyer@gridstore.local',
      role: 'buyer',
      verified: true,
      passwordHash: demoPassword,
      mustChangePassword: true,
      mfaEnabled: false,
    };

    const admin: StoredUser = {
      id: 'user-demo-admin',
      name: 'Demo Admin',
      email: 'admin@gridstore.local',
      role: 'admin',
      verified: true,
      passwordHash: demoPassword,
      mustChangePassword: true,
      mfaEnabled: false,
      mfaSecret: generateMfaSecret(),
    };

    for (const user of [seller, buyer, admin]) {
      await db`
        INSERT INTO gridstore_users (id, name, email, role, verified, password_hash, must_change_password, mfa_enabled, mfa_secret)
        VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.verified}, ${user.passwordHash}, true, ${Boolean(user.mfaEnabled)}, ${user.mfaSecret ?? null})
      `;
      this.users.set(user.id, user);
    }

    this.listings = seedProducts.slice(0, 3).map((product, index) => {
      const base = {
        ...product,
        title: demoListingBadge(product.title),
        badge: 'Demonstration',
        sellerId: seller.id,
        status: 'active' as SellerListing['status'],
        inventory: [8, 4, 12][index] ?? 1,
        riskScore: [9, 12, 18][index] ?? 10,
        verified: true,
      };

      if (index === 0) {
        return {
          ...base,
          ...resolveSaleFields({
            title: base.title,
            category: product.category,
            price: product.price,
            inventory: base.inventory,
            description: `Demonstration listing. ${product.description}`,
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
            title: base.title,
            category: product.category,
            price: product.price,
            inventory: base.inventory,
            description: `Demonstration listing. ${product.description}`,
            location: product.location,
            saleMode: 'haggle',
            haggleEnabled: true,
          }),
        };
      }

      return {
        ...base,
        ...resolveSaleFields({
          title: base.title,
          category: product.category,
          price: product.price,
          inventory: base.inventory,
          description: `Demonstration listing. ${product.description}`,
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
    if (!email?.trim()) return undefined;
    const normalized = email.trim().toLowerCase();
    return Array.from(this.users.values()).find(
      (user) => user.email?.toLowerCase() === normalized
    );
  }

  async signup(name: string, email: string, password: string): Promise<AuthUser> {
    await this.ensureSeeded();
    assertPasswordPolicy(password);
    await assertNotCompromisedPassword(password);
    if (this.getUserByEmail(email)) {
      throw new Error('An account with this email already exists');
    }

    const user = this.cacheUser({
      id: createId('user'),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'buyer',
      verified: false,
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: false,
      mfaEnabled: false,
      emailVerified: false,
    });

    const db = requireSql();
    await db`
      INSERT INTO gridstore_users (id, name, email, role, verified, password_hash, must_change_password, mfa_enabled)
      VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.verified}, ${user.passwordHash}, false, false)
    `;

    const verify = createAuthToken(user.id, 'email_verify', 60 * 24);
    await sendTransactionalEmail({
      to: user.email,
      subject: 'Verify your GridStore email',
      body: `Use this verification token within 24 hours: ${verify.rawToken}`,
    });

    return this.toAuthUser(user);
  }

  async login(
    email: string,
    password: string,
    meta: { ip?: string; userAgent?: string } = {}
  ): Promise<AuthUser> {
    await this.ensureSeeded();
    assertNotLocked(email);
    const delay = progressiveDelayMs(email);
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const user = this.getUserByEmail(email);
    if (!user || !user.passwordHash) {
      recordLoginFailure(email);
      throw new Error('Invalid email or password');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      recordLoginFailure(email);
      throw new Error('Invalid email or password');
    }

    clearLoginFailures(email);
    const previousIp = user.lastLoginIp;
    user.lastLoginAt = new Date().toISOString();
    user.lastLoginIp = meta.ip;
    if (previousIp && meta.ip && previousIp !== meta.ip) {
      await sendTransactionalEmail({
        to: user.email,
        subject: 'Suspicious login to GridStore',
        body: `A new login was detected from IP ${meta.ip}. If this was not you, reset your password immediately.`,
      });
    }
    return this.toAuthUser(user, meta);
  }

  async oauthLogin(
    provider: 'google' | 'github',
    meta: { ip?: string; userAgent?: string } = {}
  ): Promise<AuthUser> {
    await this.ensureSeeded();
    if (!env.allowSimulatedOauth) {
      throw new Error('Simulated OAuth is disabled');
    }
    const email = `${provider}.user@gridstore.local`;
    let user = this.getUserByEmail(email);

    if (!user) {
      user = this.cacheUser({
        id: createId(provider),
        name: `${provider === 'google' ? 'Google' : 'GitHub'} User`,
        email,
        role: 'buyer',
        verified: true,
        passwordHash: '',
        mustChangePassword: false,
        mfaEnabled: false,
        emailVerified: true,
      });

      const db = requireSql();
      await db`
        INSERT INTO gridstore_users (id, name, email, role, verified, password_hash, must_change_password, mfa_enabled)
        VALUES (${user.id}, ${user.name}, ${user.email}, ${user.role}, ${user.verified}, ${user.passwordHash}, false, false)
      `;
    }

    return this.toAuthUser(user, meta);
  }

  async requestPasswordReset(email: string) {
    await this.ensureSeeded();
    const user = this.getUserByEmail(email);
    if (!user) return;
    const token = createAuthToken(user.id, 'password_reset', 30);
    await sendTransactionalEmail({
      to: user.email,
      subject: 'Reset your GridStore password',
      body: `Use this single-use reset token within 30 minutes: ${token.rawToken}`,
    });
  }

  async confirmPasswordReset(token: string, password: string) {
    assertPasswordPolicy(password);
    await assertNotCompromisedPassword(password);
    const record = consumeAuthToken(token, 'password_reset');
    const user = this.users.get(record.userId);
    if (!user) throw new Error('Invalid or expired token');
    user.passwordHash = await bcrypt.hash(password, 10);
    user.mustChangePassword = false;
    const db = requireSql();
    await db`
      UPDATE gridstore_users
      SET password_hash = ${user.passwordHash}, must_change_password = false
      WHERE id = ${user.id}
    `;
    revokeAllUserSessions(user.id, 'password_reset');
    await sendTransactionalEmail({
      to: user.email,
      subject: 'Your GridStore password was changed',
      body: 'Your password was changed successfully. All other sessions were signed out.',
    });
    return this.toAuthUser(user);
  }

  async verifyEmail(token: string) {
    const record = consumeAuthToken(token, 'email_verify');
    return this.markEmailVerified(record.userId);
  }

  async markEmailVerified(userId: string) {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.emailVerified = true;
    user.verified = true;
    const db = requireSql();
    await db`UPDATE gridstore_users SET verified = true WHERE id = ${userId}`;
    return this.toPublicUser(user);
  }

  async refreshSession(sessionId: string, refreshToken: string) {
    const rotated = rotateRefreshToken(sessionId, refreshToken);
    const user = this.users.get(rotated.session.userId);
    if (!user) throw new Error('User not found');
    const publicUser = this.toPublicUser(user);
    const accessToken = signAccessToken(publicUser, rotated.session.id);
    return {
      ...publicUser,
      accessToken,
      refreshToken: rotated.refreshToken,
      expiresIn: accessTokenTtlSeconds(),
      sessionToken: accessToken,
      emailVerified: Boolean(user.emailVerified),
      mustChangePassword: Boolean(user.mustChangePassword),
      mfaEnabled: Boolean(user.mfaEnabled),
    };
  }

  async logoutSession(sessionId: string) {
    revokeSession(sessionId, 'logout');
  }

  async logoutAllSessions(userId: string) {
    return revokeAllUserSessions(userId, 'logout_all');
  }

  async verifyPassword(userId: string, password: string) {
    const user = this.users.get(userId);
    if (!user?.passwordHash) return false;
    return bcrypt.compare(password, user.passwordHash);
  }

  async enableMfa(userId: string, secret: string) {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.mfaSecret = secret;
    user.mfaEnabled = false;
    const db = requireSql();
    await db`
      UPDATE gridstore_users
      SET mfa_secret = ${secret}, mfa_enabled = false
      WHERE id = ${userId}
    `;
    return this.toPublicUser(user);
  }

  async confirmMfa(userId: string, token: string) {
    const user = this.users.get(userId);
    if (!user?.mfaSecret) return false;
    const ok = verifyTotp(user.mfaSecret, token);
    if (!ok) return false;
    user.mfaEnabled = true;
    const db = requireSql();
    await db`UPDATE gridstore_users SET mfa_enabled = true WHERE id = ${userId}`;
    return true;
  }

  isMfaSatisfied(user: StoredUser, token?: string) {
    if (user.role !== 'admin' && user.role !== 'moderator') return true;
    if (!env.isProduction && process.env.REQUIRE_MFA !== 'true') {
      return true;
    }
    if (!user.mfaEnabled || !user.mfaSecret) return false;
    if (!token) return false;
    return verifyTotp(user.mfaSecret, token);
  }

  async createSellerApplication(userId: string, input: SellerApplicationInput) {
    await this.ensureSeeded();
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    if (user.role === 'seller' || user.role === 'admin') {
      throw new Error('Account already has seller privileges');
    }
    const db = requireSql();
    const existing = await db`
      SELECT id FROM gridstore_seller_applications WHERE user_id = ${userId} LIMIT 1
    `;
    if (existing.length) throw new Error('Seller application already submitted');

    const application: SellerApplication = {
      id: createId('sapp'),
      userId,
      businessName: input.businessName,
      category: input.category,
      location: input.location,
      description: input.description,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await db`
      INSERT INTO gridstore_seller_applications (
        id, user_id, business_name, category, location, description, status, created_at
      ) VALUES (
        ${application.id}, ${application.userId}, ${application.businessName},
        ${application.category}, ${application.location}, ${application.description},
        ${application.status}, ${application.createdAt}
      )
    `;
    return application;
  }

  async getSellerApplication(userId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = await db`
      SELECT * FROM gridstore_seller_applications WHERE user_id = ${userId} LIMIT 1
    `;
    const row = rows[0] as
      | {
          id: string;
          user_id: string;
          business_name: string;
          category: string;
          location: string;
          description: string;
          status: SellerApplication['status'];
          created_at: string;
          reviewed_at?: string;
          reviewer_id?: string;
        }
      | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      userId: row.user_id,
      businessName: row.business_name,
      category: row.category,
      location: row.location,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      reviewerId: row.reviewer_id,
    };
  }

  async listSellerApplications() {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_seller_applications ORDER BY created_at DESC
    `) as Array<{
      id: string;
      user_id: string;
      business_name: string;
      category: string;
      location: string;
      description: string;
      status: SellerApplication['status'];
      created_at: string;
      reviewed_at?: string;
      reviewer_id?: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      businessName: row.business_name,
      category: row.category,
      location: row.location,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
      reviewerId: row.reviewer_id,
    }));
  }

  async reviewSellerApplication(
    applicationId: string,
    reviewerId: string,
    decision: 'approved' | 'rejected'
  ) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = await db`
      SELECT * FROM gridstore_seller_applications WHERE id = ${applicationId} LIMIT 1
    `;
    const row = rows[0] as
      | {
          id: string;
          user_id: string;
          business_name: string;
          category: string;
          location: string;
          description: string;
          status: SellerApplication['status'];
          created_at: string;
        }
      | undefined;
    if (!row) throw new Error('Application not found');
    const reviewedAt = new Date().toISOString();
    await db`
      UPDATE gridstore_seller_applications
      SET status = ${decision}, reviewed_at = ${reviewedAt}, reviewer_id = ${reviewerId}
      WHERE id = ${applicationId}
    `;
    if (decision === 'approved') {
      await db`UPDATE gridstore_users SET role = 'seller' WHERE id = ${row.user_id}`;
      const user = this.users.get(row.user_id);
      if (user) user.role = 'seller';
    }
    return {
      id: row.id,
      userId: row.user_id,
      businessName: row.business_name,
      category: row.category,
      location: row.location,
      description: row.description,
      status: decision,
      createdAt: row.created_at,
      reviewedAt,
      reviewerId,
    };
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
    void userId;
    void orderId;
    void status;
    throw new Error('Direct status updates are disabled; use order transitions');
  }

  listOrderEvents(orderId: string) {
    return this.orderEvents
      .filter((event) => event.orderId === orderId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private expireReservations() {
    const now = Date.now();
    for (const reservation of this.reservations) {
      if (reservation.status !== 'held') continue;
      if (new Date(reservation.expiresAt).getTime() > now) continue;
      reservation.status = 'expired';
      const order = this.orders.find((item) => item.id === reservation.orderId);
      if (order && order.status === 'pending_payment') {
        const from = order.status;
        order.status = 'cancelled';
        void this.persistOrderStatus(order);
        this.pushEvent(
          createOrderEvent({
            orderId: order.id,
            type: 'reservation_expired',
            fromStatus: from,
            toStatus: 'cancelled',
          })
        );
      }
    }
  }

  private availableInventory(listingId: string) {
    this.expireReservations();
    const listing = this.listings.find((item) => item.id === listingId);
    if (!listing) return 0;
    const held = this.reservations
      .filter((item) => item.listingId === listingId && item.status === 'held')
      .reduce((sum, item) => sum + item.quantity, 0);
    return listing.inventory - held;
  }

  private pushEvent(event: OrderEvent) {
    this.orderEvents.push(event);
    const order = this.orders.find((item) => item.id === event.orderId);
    if (order) {
      order.events = this.listOrderEvents(order.id);
    }
    void this.persistEvent(event);
  }

  private async persistEvent(event: OrderEvent) {
    const db = requireSql();
    await db`
      INSERT INTO gridstore_order_events (
        id, order_id, type, actor_id, from_status, to_status, detail, created_at
      ) VALUES (
        ${event.id}, ${event.orderId}, ${event.type}, ${event.actorId ?? null},
        ${event.fromStatus ?? null}, ${event.toStatus ?? null},
        ${event.detail ? JSON.stringify(event.detail) : null}, ${event.createdAt}
      )
    `;
  }

  private async persistOrderStatus(order: Order) {
    const db = requireSql();
    await db`
      UPDATE gridstore_orders
      SET status = ${order.status},
          payment_status = ${order.paymentStatus},
          tracking_number = ${order.trackingNumber ?? null}
      WHERE id = ${order.id}
    `;
  }

  private async adjustInventory(
    listingId: string,
    delta: number,
    reason: string,
    orderId?: string,
    actorId?: string
  ) {
    const listing = this.listings.find((item) => item.id === listingId);
    if (!listing) throw new Error('Listing not found for inventory adjustment');
    const next = listing.inventory + delta;
    if (next < 0) throw new Error('Insufficient inventory');
    listing.inventory = next;
    if (listing.inventory === 0 && listing.status === 'active') {
      listing.status = 'paused';
    }
    const adjustment: InventoryAdjustment = {
      id: createId('iadj'),
      listingId,
      delta,
      reason,
      orderId,
      actorId,
      createdAt: new Date().toISOString(),
    };
    this.adjustments.push(adjustment);

    const db = requireSql();
    await db`
      UPDATE gridstore_listings
      SET inventory = ${listing.inventory}, status = ${listing.status}
      WHERE id = ${listingId}
    `;
    await db`
      INSERT INTO gridstore_inventory_adjustments (
        id, listing_id, delta, reason, order_id, actor_id, created_at
      ) VALUES (
        ${adjustment.id}, ${listingId}, ${delta}, ${reason},
        ${orderId ?? null}, ${actorId ?? null}, ${adjustment.createdAt}
      )
    `;
  }

  async transitionOrder(
    actor: { userId: string; role: string },
    orderId: string,
    action: OrderTransitionAction,
    meta?: { trackingNumber?: string }
  ): Promise<Order> {
    const order = this.orders.find((item) => item.id === orderId);
    if (!order) throw new Error('Order not found');

    const next = assertOrderTransition(order, action, actor);
    const fromStatus = order.status;
    order.status = next.status;
    if (next.paymentStatus) order.paymentStatus = next.paymentStatus;
    if (action === 'ship' && meta?.trackingNumber) {
      order.trackingNumber = meta.trackingNumber.trim();
    }

    if (action === 'confirm_payment') {
      for (const reservation of this.reservations.filter((item) => item.orderId === orderId && item.status === 'held')) {
        await this.adjustInventory(reservation.listingId, -reservation.quantity, 'payment_commit', orderId, actor.userId);
        reservation.status = 'committed';
        await this.persistReservationStatus(reservation);
      }
    }

    if (action === 'cancel') {
      for (const reservation of this.reservations.filter((item) => item.orderId === orderId && item.status === 'held')) {
        reservation.status = 'released';
        await this.persistReservationStatus(reservation);
      }
    }

    if (action === 'refund') {
      for (const line of order.lines) {
        await this.adjustInventory(line.productId, line.quantity, 'refund_restock', orderId, actor.userId);
      }
      for (const reservation of this.reservations.filter((item) => item.orderId === orderId)) {
        if (reservation.status === 'held') {
          reservation.status = 'released';
          await this.persistReservationStatus(reservation);
        }
      }
    }

    await this.persistOrderStatus(order);
    this.pushEvent(
      createOrderEvent({
        orderId,
        type: `transition.${action}`,
        actorId: actor.userId,
        fromStatus,
        toStatus: order.status,
        detail: meta?.trackingNumber ? { trackingNumber: meta.trackingNumber } : undefined,
      })
    );

    return order;
  }

  private async persistReservationStatus(reservation: InventoryReservation) {
    const db = requireSql();
    await db`
      UPDATE gridstore_inventory_reservations
      SET status = ${reservation.status}
      WHERE id = ${reservation.id}
    `;
  }

  async createOrder(userId: string, input: CreateOrderInput): Promise<Order> {
    if (!input.deliveryAddress.trim()) {
      throw new Error('Delivery address is required');
    }

    const idemKey = input.idempotencyKey?.trim();
    if (idemKey) {
      const existingId = this.idempotency.get(`${userId}:${idemKey}`);
      if (existingId) {
        const existing = this.orders.find((order) => order.id === existingId);
        if (existing) return existing;
      }
    }

    const { lines, totalCents } = buildAuthoritativeLines(input.lines, (productId) =>
      this.getListing(productId)
    );

    for (const line of lines) {
      const available = this.availableInventory(line.productId);
      if (available < line.quantity) {
        throw new Error(`Insufficient stock for ${line.title}`);
      }
    }

    const pendingPayment =
      input.paymentMethod === 'manual_eft' ||
      input.paymentMethod === 'card' ||
      input.paymentMethod === 'paystack';
    const order: Order = {
      id: createId('ord'),
      userId,
      status: pendingPayment ? 'pending_payment' : 'paid',
      paymentStatus: pendingPayment ? 'requires_provider' : 'paid',
      total: centsToRands(totalCents),
      totalCents,
      deliveryAddress: input.deliveryAddress.trim(),
      paymentMethod: input.paymentMethod,
      receiptNumber: `GS-${Date.now().toString().slice(-8)}`,
      createdAt: nowLabel(),
      lines,
      events: [],
      idempotencyKey: idemKey,
    };

    const db = requireSql();
    await db`
      INSERT INTO gridstore_orders (
        id, user_id, status, payment_status, total, total_cents, delivery_address,
        payment_method, receipt_number, created_at, idempotency_key
      ) VALUES (
        ${order.id}, ${order.userId}, ${order.status}, ${order.paymentStatus},
        ${order.total}, ${order.totalCents}, ${order.deliveryAddress},
        ${order.paymentMethod ?? null}, ${order.receiptNumber}, ${order.createdAt},
        ${order.idempotencyKey ?? null}
      )
    `;

    for (const line of order.lines) {
      await db`
        INSERT INTO gridstore_order_lines (
          order_id, product_id, title, seller, seller_id, quantity, unit_price, unit_price_cents
        ) VALUES (
          ${order.id}, ${line.productId}, ${line.title}, ${line.seller},
          ${line.sellerId ?? null}, ${line.quantity}, ${line.unitPrice}, ${line.unitPriceCents}
        )
      `;

      const reservation: InventoryReservation = {
        id: createId('ires'),
        orderId: order.id,
        listingId: line.productId,
        quantity: line.quantity,
        status: pendingPayment ? 'held' : 'committed',
        expiresAt: reservationExpiryIso(),
        createdAt: new Date().toISOString(),
      };
      this.reservations.push(reservation);
      await db`
        INSERT INTO gridstore_inventory_reservations (
          id, order_id, listing_id, quantity, status, expires_at, created_at
        ) VALUES (
          ${reservation.id}, ${reservation.orderId}, ${reservation.listingId},
          ${reservation.quantity}, ${reservation.status}, ${reservation.expiresAt},
          ${reservation.createdAt}
        )
      `;

      if (!pendingPayment) {
        await this.adjustInventory(line.productId, -line.quantity, 'checkout_paid', order.id, userId);
      }
    }

    this.orders.unshift(order);
    if (idemKey) {
      this.idempotency.set(`${userId}:${idemKey}`, order.id);
    }

    this.pushEvent(
      createOrderEvent({
        orderId: order.id,
        type: 'order.created',
        actorId: userId,
        toStatus: order.status,
        detail: { paymentMethod: input.paymentMethod, totalCents },
      })
    );

    if (input.paymentMethod === 'card' || input.paymentMethod === 'paystack') {
      const { createIntentForOrder } = await import('../services/paymentService.js');
      await createIntentForOrder({
        orderId: order.id,
        userId,
        idempotencyKey: idemKey ? `pay-${idemKey}` : undefined,
      });
      const refreshed = this.orders.find((item) => item.id === order.id);
      return refreshed ?? order;
    }

    return order;
  }

  async refundOrder(userId: string, orderId: string): Promise<Order> {
    const user = this.users.get(userId);
    return this.transitionOrder({ userId, role: user?.role ?? 'buyer' }, orderId, 'refund');
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

  listAllUsersAdmin() {
    return Array.from(this.users.values()).map((user) => ({
      ...this.toPublicUser(user),
      mustChangePassword: Boolean(user.mustChangePassword),
      mfaEnabled: Boolean(user.mfaEnabled),
    }));
  }

  async adminResetUserPassword(userId: string, password: string) {
    assertPasswordPolicy(password);
    await assertNotCompromisedPassword(password);
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    user.mustChangePassword = true;

    const db = requireSql();
    await db`
      UPDATE gridstore_users
      SET password_hash = ${user.passwordHash}, must_change_password = true
      WHERE id = ${userId}
    `;
    revokeAllUserSessions(userId, 'admin_password_reset');
    await sendTransactionalEmail({
      to: user.email,
      subject: 'Your GridStore password was reset',
      body: 'An administrator reset your password. All sessions were signed out.',
    });

    return {
      ...this.toPublicUser(user),
      mustChangePassword: true,
      mfaEnabled: Boolean(user.mfaEnabled),
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
    const roleChanged = patch.role !== undefined && patch.role !== user.role;
    if (patch.role !== undefined) user.role = patch.role;
    if (patch.verified !== undefined) user.verified = patch.verified;

    const db = requireSql();
    await db`
      UPDATE gridstore_users
      SET role = ${user.role}, verified = ${user.verified}
      WHERE id = ${userId}
    `;
    if (roleChanged) {
      revokeAllUserSessions(userId, 'role_changed');
    }
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

    const actionMap: Partial<Record<NonNullable<typeof patch.status>, OrderTransitionAction>> = {
      paid: 'confirm_payment',
      processing: 'start_processing',
      shipped: 'ship',
      delivered: 'deliver',
      cancelled: 'cancel',
      refunded: 'refund',
    };

    if (patch.status && patch.status !== order.status) {
      const action = actionMap[patch.status];
      if (!action) {
        throw new Error(`Unsupported order transition to ${patch.status}`);
      }
      await this.transitionOrder({ userId: 'admin', role: 'admin' }, orderId, action);
    } else if (patch.paymentStatus && patch.paymentStatus !== order.paymentStatus) {
      if (patch.paymentStatus === 'paid' && order.status === 'pending_payment') {
        await this.transitionOrder({ userId: 'admin', role: 'admin' }, orderId, 'confirm_payment');
      } else {
        throw new Error('Unsupported payment status change');
      }
    }

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
    patch: Partial<
      Pick<
        SellerListing,
        'currentBid' | 'bidCount' | 'auctionStatus' | 'haggleEnabled' | 'saleMode' | 'auctionEndsAt'
      >
    >
  ) {
    const listing = this.listings.find((item) => item.id === listingId);
    if (!listing) throw new Error('Listing not found');
    if (patch.currentBid !== undefined) listing.currentBid = patch.currentBid;
    if (patch.bidCount !== undefined) listing.bidCount = patch.bidCount;
    if (patch.auctionStatus !== undefined) listing.auctionStatus = patch.auctionStatus;
    if (patch.haggleEnabled !== undefined) listing.haggleEnabled = patch.haggleEnabled;
    if (patch.saleMode !== undefined) listing.saleMode = patch.saleMode;
    if (patch.auctionEndsAt !== undefined) listing.auctionEndsAt = patch.auctionEndsAt;

    const db = requireSql();
    await db`
      UPDATE gridstore_listings
      SET
        current_bid = ${listing.currentBid ?? null},
        bid_count = ${listing.bidCount},
        auction_status = ${listing.auctionStatus},
        haggle_enabled = ${listing.haggleEnabled},
        sale_mode = ${listing.saleMode},
        auction_ends_at = ${listing.auctionEndsAt ?? null}
      WHERE id = ${listingId}
    `;
    return listing;
  }

  private toAuthUser(
    user: StoredUser,
    meta: { ip?: string; userAgent?: string } = {}
  ): AuthUser {
    const publicUser = this.toPublicUser(user);
    const { session, refreshToken } = createSession({
      userId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    const accessToken = signAccessToken(publicUser, session.id);
    return {
      ...publicUser,
      accessToken,
      refreshToken,
      expiresIn: accessTokenTtlSeconds(),
      sessionToken: accessToken,
      emailVerified: Boolean(user.emailVerified),
      mustChangePassword: Boolean(user.mustChangePassword),
      mfaEnabled: Boolean(user.mfaEnabled),
    };
  }
}
