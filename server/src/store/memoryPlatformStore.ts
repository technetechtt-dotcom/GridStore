import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { seedProducts } from '../data/seed.js';
import { DEMO_SEED_PASSWORD, demoListingBadge } from '../lib/demo.js';
import { createId, nowLabel } from '../lib/ids.js';
import { matchesQuery } from '../lib/search.js';
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
import { accessTokenTtlSeconds, signAccessToken } from '../lib/tokens.js';
import { assertPasswordPolicy, generateMfaSecret, verifyTotp } from '../lib/security.js';
import {
  assertOrderTransition,
  buildAuthoritativeLines,
  centsToRands,
  createOrderEvent,
  reservationExpiryIso,
  type InventoryAdjustment,
  type InventoryReservation,
  type OrderTransitionAction,
} from '../lib/orderCommerce.js';
import type {
  AppUser,
  AuthUser,
  Order,
  OrderEvent,
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
import { resolveSaleFields } from '../lib/listingSale.js';

export class MemoryPlatformStore implements PlatformStore {
  private users = new Map<string, StoredUser>();
  private orders: Order[] = [];
  private listings: SellerListing[] = [];
  private sellerApplications = new Map<string, SellerApplication>();
  private orderEvents: OrderEvent[] = [];
  private reservations: InventoryReservation[] = [];
  private adjustments: InventoryAdjustment[] = [];
  private idempotency = new Map<string, string>();
  private seeded = false;

  async ensureSeeded() {
    if (this.seeded) return;
    this.seeded = true;

    if (!env.enableDemoData) {
      return;
    }

    const demoPassword = await bcrypt.hash(DEMO_SEED_PASSWORD, 10);

    const seller = this.createStoredUser({
      id: 'user-demo-seller',
      name: 'Demo Seller',
      email: 'seller@gridstore.local',
      role: 'seller',
      verified: true,
      passwordHash: demoPassword,
      mustChangePassword: true,
      mfaEnabled: false,
    });

    this.createStoredUser({
      id: 'user-demo-buyer',
      name: 'Demo Buyer',
      email: 'buyer@gridstore.local',
      role: 'buyer',
      verified: true,
      passwordHash: demoPassword,
      mustChangePassword: true,
      mfaEnabled: false,
    });

    this.createStoredUser({
      id: 'user-demo-admin',
      name: 'Demo Admin',
      email: 'admin@gridstore.local',
      role: 'admin',
      verified: true,
      passwordHash: demoPassword,
      mustChangePassword: true,
      mfaEnabled: true,
      mfaSecret: generateMfaSecret(),
    });

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

  async signup(name: string, email: string, password: string): Promise<AuthUser> {
    await this.ensureSeeded();
    assertPasswordPolicy(password);
    await assertNotCompromisedPassword(password);
    if (this.getUserByEmail(email)) {
      throw new Error('An account with this email already exists');
    }

    const user = this.createStoredUser({
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

    const verify = createAuthToken(user.id, 'email_verify', 60 * 24);
    await sendTransactionalEmail({
      to: user.email,
      subject: 'Verify your GridStore email',
      body: `Use this verification token within 24 hours: ${verify.rawToken}`,
    });

    return this.toAuthUser(user);
  }

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string } = {}): Promise<AuthUser> {
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
    user.lastLoginAt = new Date().toISOString();
    user.lastLoginIp = meta.ip;

    if (user.lastLoginIp && meta.ip && user.lastLoginIp !== meta.ip) {
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
      user = this.createStoredUser({
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
    }
    return this.toAuthUser(user, meta);
  }

  async requestPasswordReset(email: string) {
    await this.ensureSeeded();
    const user = this.getUserByEmail(email);
    // Always succeed to avoid account enumeration.
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
    return this.toPublicUser(user);
  }

  async confirmMfa(userId: string, token: string) {
    const user = this.users.get(userId);
    if (!user?.mfaSecret) return false;
    const ok = verifyTotp(user.mfaSecret, token);
    if (ok) user.mfaEnabled = true;
    return ok;
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
    if (this.sellerApplications.has(userId)) {
      throw new Error('Seller application already submitted');
    }
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
    this.sellerApplications.set(userId, application);
    return application;
  }

  async getSellerApplication(userId: string) {
    return this.sellerApplications.get(userId);
  }

  async listSellerApplications() {
    return Array.from(this.sellerApplications.values());
  }

  async reviewSellerApplication(
    applicationId: string,
    reviewerId: string,
    decision: 'approved' | 'rejected'
  ) {
    const application = Array.from(this.sellerApplications.values()).find(
      (item) => item.id === applicationId
    );
    if (!application) throw new Error('Application not found');
    application.status = decision;
    application.reviewedAt = new Date().toISOString();
    application.reviewerId = reviewerId;
    if (decision === 'approved') {
      const user = this.users.get(application.userId);
      if (user) user.role = 'seller';
    }
    return application;
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
  }

  private adjustInventory(listingId: string, delta: number, reason: string, orderId?: string, actorId?: string) {
    const listing = this.listings.find((item) => item.id === listingId);
    if (!listing) throw new Error('Listing not found for inventory adjustment');
    const next = listing.inventory + delta;
    if (next < 0) throw new Error('Insufficient inventory');
    listing.inventory = next;
    if (listing.inventory === 0 && listing.status === 'active') {
      listing.status = 'paused';
    }
    this.adjustments.push({
      id: createId('iadj'),
      listingId,
      delta,
      reason,
      orderId,
      actorId,
      createdAt: new Date().toISOString(),
    });
  }

  async transitionOrder(
    actor: { userId: string; role: string },
    orderId: string,
    action: OrderTransitionAction,
    meta?: { trackingNumber?: string }
  ): Promise<Order> {
    const order =
      this.orders.find((item) => item.id === orderId) ??
      (() => {
        throw new Error('Order not found');
      })();

    if (actor.role === 'buyer' && order.userId !== actor.userId && !['cancel', 'refund', 'deliver'].includes(action)) {
      throw new Error('Order not found');
    }

    const next = assertOrderTransition(order, action, actor);
    const fromStatus = order.status;
    order.status = next.status;
    if (next.paymentStatus) order.paymentStatus = next.paymentStatus;
    if (action === 'ship' && meta?.trackingNumber) {
      order.trackingNumber = meta.trackingNumber.trim();
    }

    if (action === 'confirm_payment') {
      for (const reservation of this.reservations.filter((item) => item.orderId === orderId && item.status === 'held')) {
        this.adjustInventory(reservation.listingId, -reservation.quantity, 'payment_commit', orderId, actor.userId);
        reservation.status = 'committed';
      }
    }

    if (action === 'cancel') {
      for (const reservation of this.reservations.filter((item) => item.orderId === orderId && item.status === 'held')) {
        reservation.status = 'released';
      }
    }

    if (action === 'refund') {
      for (const line of order.lines) {
        this.adjustInventory(line.productId, line.quantity, 'refund_restock', orderId, actor.userId);
      }
      for (const reservation of this.reservations.filter((item) => item.orderId === orderId)) {
        if (reservation.status === 'held') reservation.status = 'released';
      }
    }

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

    const pendingPayment = input.paymentMethod === 'manual_eft';
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

    for (const line of lines) {
      if (pendingPayment) {
        this.reservations.push({
          id: createId('ires'),
          orderId: order.id,
          listingId: line.productId,
          quantity: line.quantity,
          status: 'held',
          expiresAt: reservationExpiryIso(),
          createdAt: new Date().toISOString(),
        });
      } else {
        this.adjustInventory(line.productId, -line.quantity, 'checkout_paid', order.id, userId);
        this.reservations.push({
          id: createId('ires'),
          orderId: order.id,
          listingId: line.productId,
          quantity: line.quantity,
          status: 'committed',
          expiresAt: reservationExpiryIso(),
          createdAt: new Date().toISOString(),
        });
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

    return order;
  }

  async refundOrder(userId: string, orderId: string): Promise<Order> {
    const user = this.users.get(userId);
    return this.transitionOrder(
      { userId, role: user?.role ?? 'buyer' },
      orderId,
      'refund'
    );
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
