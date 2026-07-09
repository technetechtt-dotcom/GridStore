import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { products } from '../data/catalog';
import {
  apiClearNotifications,
  apiCreateApplication,
  apiCreateBooking,
  apiCreateListing,
  apiCreateOrder,
  apiCreateReport,
  apiCreateReservation,
  apiCreateStore,
  apiGetActiveListings,
  apiGetMe,
  apiLogin,
  apiLogout,
  apiMarkNotificationRead,
  apiOAuthLogin,
  apiRefundOrder,
  apiRequestPasswordReset,
  apiSaveCart,
  apiSaveWishlist,
  apiSendMessage,
  apiSignup,
  apiToggleListingPause,
  apiUpdateListing,
  apiUpdateProfile,
  apiUpdateStore,
  AUTH_SESSION_EXPIRED_EVENT,
  getAuthToken,
  hydrateAuthToken,
  isPlatformApiAvailable,
  setAuthToken,
  shouldUseLocalAuthFallback,
  syncPlatformData,
} from '../services/platformApi';
import {
  apiGetIncomingOffers,
  apiGetListingOffers,
  apiPlaceBid,
  apiRespondToOffer,
  apiSubmitOffer,
} from '../services/tradeApi';
import { subscribeApiMode } from '../services/apiConnection';
import type {
  AppUser,
  BookingRequest,
  JobApplication,
  MessageItem,
  MessageThread,
  NotificationItem,
  Order,
  PayoutSummary,
  Product,
  RentalReservation,
  SellerListing,
  TrustReport,
  UserRole,
  HaggleOffer,
  AuctionBid,
  StoreProfile,
} from '../types';

interface CartLine {
  product: Product;
  quantity: number;
}

interface CheckoutInput {
  deliveryAddress: string;
  paymentMethod: string;
}

interface StorefrontInput {
  name: string;
  category: string;
  location: string;
  description: string;
  supportEmail?: string;
  status?: 'active' | 'draft' | 'paused';
}

interface SellerListingInput {
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

interface AppContextValue {
  user: AppUser | null;
  cartLines: CartLine[];
  cartCount: number;
  cartTotal: number;
  wishlistIds: string[];
  notifications: NotificationItem[];
  messageThreads: MessageThread[];
  orders: Order[];
  sellerListings: SellerListing[];
  sellerStores: StoreProfile[];
  bookingRequests: BookingRequest[];
  rentalReservations: RentalReservation[];
  jobApplications: JobApplication[];
  trustReports: TrustReport[];
  payoutSummary: PayoutSummary;
  unreadNotifications: number;
  login: (email: string, password: string, role?: UserRole) => Promise<AppUser>;
  signup: (name: string, email: string, password: string, role?: UserRole) => Promise<AppUser>;
  requestPasswordReset: (email: string) => Promise<void>;
  oauthLogin: (provider: 'google' | 'github', role?: UserRole) => Promise<AppUser>;
  logout: () => void;
  addToCart: (productId: string, quantity?: number) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  isInWishlist: (productId: string) => boolean;
  toggleWishlist: (productId: string) => void;
  createOrder: (input: CheckoutInput) => Promise<Order>;
  requestRefund: (orderId: string) => Promise<void>;
  createSellerListing: (input: SellerListingInput) => Promise<SellerListing>;
  updateSellerListing: (listingId: string, input: Partial<SellerListingInput>) => Promise<void>;
  pauseSellerListing: (listingId: string) => Promise<void>;
  createStorefront: (input: StorefrontInput) => Promise<StoreProfile>;
  updateStorefront: (storeId: string, input: Partial<StorefrontInput>) => Promise<StoreProfile>;
  generateListingDraft: (seed: string) => SellerListingInput;
  submitOffer: (listingId: string, amount: number, message?: string) => Promise<HaggleOffer>;
  respondToOffer: (
    offerId: string,
    action: 'accept' | 'decline' | 'counter',
    counterAmount?: number
  ) => Promise<HaggleOffer>;
  loadListingOffers: (listingId: string) => Promise<HaggleOffer[]>;
  loadIncomingOffers: () => Promise<HaggleOffer[]>;
  placeBid: (listingId: string, amount: number) => Promise<{ bid: AuctionBid; listing: SellerListing }>;
  markNotificationRead: (id: string) => void;
  clearAllNotifications: () => void;
  sendMessage: (threadId: string, text: string, author?: 'buyer' | 'seller') => void;
  requestServiceBooking: (serviceId: string, serviceTitle: string, provider: string, note: string) => void;
  requestRentalReservation: (rentalId: string, rentalTitle: string, startDate: string, endDate: string) => void;
  submitJobApplication: (jobId: string, jobTitle: string, applicantName: string, cvFileName: string) => void;
  reportTrustIssue: (targetType: TrustReport['targetType'], targetId: string, reason: string) => void;
  updateProfile: (input: { name: string; email: string }) => Promise<void>;
}

interface PersistedState {
  user: AppUser | null;
  cart: Record<string, number>;
  wishlistIds: string[];
  notifications: NotificationItem[];
  messageThreads: MessageThread[];
  orders: Order[];
  sellerListings: SellerListing[];
  sellerStores: StoreProfile[];
  bookingRequests: BookingRequest[];
  rentalReservations: RentalReservation[];
  jobApplications: JobApplication[];
  trustReports: TrustReport[];
}

const STORAGE_KEY = 'gridstore-app-state-v2';

const defaultNotifications: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Price Drop Alert',
    description: 'Sony Alpha a7 IV is now 10% off.',
    createdAt: '2 hours ago',
    unread: true,
  },
  {
    id: 'notif-2',
    title: 'Order Shipped',
    description: 'Your order #12345 has been shipped and is on its way.',
    createdAt: '1 day ago',
    unread: false,
  },
];

const defaultThreads: MessageThread[] = [
  {
    id: 'thread-cameraworld',
    title: 'Sony Alpha a7 IV',
    participant: 'CameraWorld ZA',
    messages: [
      {
        id: 'msg-1',
        author: 'seller',
        text: 'Hi, this model includes warranty and free insured delivery.',
        createdAt: 'Yesterday',
      },
    ],
  },
];

const defaultSellerListings: SellerListing[] = products.slice(0, 3).map((product, index) => ({
  ...product,
  status: index === 2 ? 'paused' : 'active',
  inventory: [8, 4, 2][index] ?? 1,
  riskScore: [9, 12, 18][index] ?? 10,
  verified: true,
}));

const defaultState: PersistedState = {
  user: null,
  cart: {},
  wishlistIds: [],
  notifications: defaultNotifications,
  messageThreads: defaultThreads,
  orders: [],
  sellerListings: defaultSellerListings,
  sellerStores: [],
  bookingRequests: [],
  rentalReservations: [],
  jobApplications: [],
  trustReports: [],
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

function loadState(): PersistedState {
  if (typeof window === 'undefined') return defaultState;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      user: parsed.user ?? null,
      cart: parsed.cart ?? {},
      wishlistIds: parsed.wishlistIds ?? [],
      notifications: parsed.notifications ?? defaultNotifications,
      messageThreads: parsed.messageThreads ?? defaultThreads,
      orders: parsed.orders ?? [],
      sellerListings: parsed.sellerListings ?? defaultSellerListings,
      sellerStores: parsed.sellerStores ?? [],
      bookingRequests: parsed.bookingRequests ?? [],
      rentalReservations: parsed.rentalReservations ?? [],
      jobApplications: parsed.jobApplications ?? [],
      trustReports: parsed.trustReports ?? [],
    };
  } catch {
    return defaultState;
  }
}

function saveState(state: PersistedState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function buildDisplayNameFromEmail(email: string) {
  const base = email.split('@')[0] ?? 'User';
  return base
    .split('.')
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function inferRoleFromEmail(email: string, fallback: UserRole) {
  const lower = (email ?? '').toLowerCase();
  if (lower.includes('admin')) return 'admin';
  if (lower.includes('mod')) return 'moderator';
  if (lower.includes('seller') || lower.includes('store')) return 'seller';
  return fallback;
}

function createSessionToken() {
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowLabel() {
  return new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const initialState = useMemo(() => {
    const loaded = loadState();
    hydrateAuthToken(loaded.user);
    return loaded;
  }, []);

  const [user, setUser] = useState<AppUser | null>(initialState.user);
  const [cart, setCart] = useState<Record<string, number>>(initialState.cart);
  const [wishlistIds, setWishlistIds] = useState<string[]>(initialState.wishlistIds);
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    initialState.notifications
  );
  const [messageThreads, setMessageThreads] = useState<MessageThread[]>(
    initialState.messageThreads
  );
  const [orders, setOrders] = useState<Order[]>(initialState.orders);
  const [sellerListings, setSellerListings] = useState<SellerListing[]>(
    initialState.sellerListings
  );
  const [sellerStores, setSellerStores] = useState<StoreProfile[]>(initialState.sellerStores);
  const [bookingRequests, setBookingRequests] = useState<BookingRequest[]>(
    initialState.bookingRequests
  );
  const [rentalReservations, setRentalReservations] = useState<RentalReservation[]>(
    initialState.rentalReservations
  );
  const [jobApplications, setJobApplications] = useState<JobApplication[]>(
    initialState.jobApplications
  );
  const [trustReports, setTrustReports] = useState<TrustReport[]>(initialState.trustReports);

  const persist = (next: Partial<PersistedState>) => {
    saveState({
      user: next.user ?? user,
      cart: next.cart ?? cart,
      wishlistIds: next.wishlistIds ?? wishlistIds,
      notifications: next.notifications ?? notifications,
      messageThreads: next.messageThreads ?? messageThreads,
      orders: next.orders ?? orders,
      sellerListings: next.sellerListings ?? sellerListings,
      sellerStores: next.sellerStores ?? sellerStores,
      bookingRequests: next.bookingRequests ?? bookingRequests,
      rentalReservations: next.rentalReservations ?? rentalReservations,
      jobApplications: next.jobApplications ?? jobApplications,
      trustReports: next.trustReports ?? trustReports,
    });
  };

  const applySyncedState = (synced: Awaited<ReturnType<typeof syncPlatformData>>, fallbackUser?: AppUser | null) => {
    if (synced.user ?? fallbackUser) {
      setUser(synced.user ?? fallbackUser ?? null);
    }
    setOrders(synced.orders);
    if (synced.sellerListings.length) {
      setSellerListings(synced.sellerListings);
    }
    setSellerStores(synced.sellerStores);
    setCart(synced.cart);
    setWishlistIds(synced.wishlistIds);
    if (synced.notifications.length) {
      setNotifications(synced.notifications);
    }
    if (synced.messageThreads.length) {
      setMessageThreads(synced.messageThreads);
    }
    setBookingRequests(synced.bookingRequests);
    setRentalReservations(synced.rentalReservations);
    setJobApplications(synced.jobApplications);
    setTrustReports(synced.trustReports);
    persist({
      user: synced.user ?? fallbackUser ?? user,
      orders: synced.orders,
      sellerListings: synced.sellerListings.length ? synced.sellerListings : sellerListings,
      sellerStores: synced.sellerStores,
      cart: synced.cart,
      wishlistIds: synced.wishlistIds,
      notifications: synced.notifications.length ? synced.notifications : notifications,
      messageThreads: synced.messageThreads.length ? synced.messageThreads : messageThreads,
      bookingRequests: synced.bookingRequests,
      rentalReservations: synced.rentalReservations,
      jobApplications: synced.jobApplications,
      trustReports: synced.trustReports,
    });
  };

  const refreshFromApi = useCallback(async () => {
    if (!isPlatformApiAvailable() || !getAuthToken()) return;

    try {
      const synced = await syncPlatformData();
      applySyncedState(synced);
    } catch {
      // Keep local persisted state when sync fails.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist mirrors current React state snapshot
  }, [sellerListings, user, notifications, messageThreads]);

  useEffect(() => {
    return subscribeApiMode((mode) => {
      if (mode === 'live' && getAuthToken()) {
        void refreshFromApi();
      }
    });
  }, [refreshFromApi]);

  useEffect(() => {
    void (async () => {
      hydrateAuthToken(user);
      const token = getAuthToken();
      if (!token) {
        if (user && isPlatformApiAvailable()) {
          setUser(null);
          persist({ user: null });
        }
        return;
      }
      try {
        const me = await apiGetMe();
        setUser(me);
        persist({ user: me });
      } catch {
        setAuthToken(null);
        setUser(null);
        persist({ user: null });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore session once on mount
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      persist({ user: null });
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- global auth expiry handler
  }, []);

  const completeAuth = async (nextUser: AppUser) => {
    const token = getAuthToken() ?? nextUser.sessionToken ?? null;
    if (token) {
      setAuthToken(token);
    }
    const userWithToken = token ? { ...nextUser, sessionToken: token } : nextUser;
    setUser(userWithToken);
    try {
      const synced = await syncPlatformData();
      applySyncedState(synced, userWithToken);
      return synced.user ?? userWithToken;
    } catch {
      persist({ user: userWithToken });
      return userWithToken;
    }
  };

  const loginLocal = async (email: string, password: string, role: UserRole = 'buyer') => {
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    const nextUser: AppUser = {
      id: `user-${Date.now()}`,
      name: buildDisplayNameFromEmail(email),
      email,
      role: inferRoleFromEmail(email, role),
      sessionToken: createSessionToken(),
      verified: true,
    };
    setAuthToken(nextUser.sessionToken ?? null);
    setUser(nextUser);
    persist({ user: nextUser });
    return nextUser;
  };

  const signupLocal = async (
    name: string,
    email: string,
    password: string,
    role: UserRole = 'buyer'
  ) => {
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    const nextUser: AppUser = {
      id: `user-${Date.now()}`,
      name,
      email,
      role,
      sessionToken: createSessionToken(),
      verified: false,
    };
    setUser(nextUser);
    persist({ user: nextUser });
    return nextUser;
  };

  const login = async (email: string, password: string, role: UserRole = 'buyer') => {
    const requiresApi = role === 'admin' || role === 'moderator';
    try {
      const nextUser = await apiLogin(email, password, role);
      return completeAuth(nextUser);
    } catch (error) {
      if (requiresApi || !shouldUseLocalAuthFallback(error)) {
        throw error;
      }
      return loginLocal(email, password, role);
    }
  };

  const signup = async (
    name: string,
    email: string,
    password: string,
    role: UserRole = 'buyer'
  ) => {
    try {
      const nextUser = await apiSignup(name, email, password, role);
      return completeAuth(nextUser);
    } catch (error) {
      if (!shouldUseLocalAuthFallback(error)) {
        throw error;
      }
      return signupLocal(name, email, password, role);
    }
  };

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .map(([productId, quantity]) => ({
          product:
            sellerListings.find((item) => item.id === productId) ??
            products.find((item) => item.id === productId),
          quantity,
        }))
        .filter((item): item is { product: Product; quantity: number } => Boolean(item.product)),
    [cart, sellerListings]
  );

  const cartCount = useMemo(
    () => cartLines.reduce((sum, item) => sum + item.quantity, 0),
    [cartLines]
  );

  const cartTotal = useMemo(
    () => cartLines.reduce((sum, item) => sum + item.quantity * item.product.price, 0),
    [cartLines]
  );

  const requestPasswordReset = async (email: string) => {
    if (!email.includes('@')) {
      throw new Error('Enter a valid email address');
    }

    if (isPlatformApiAvailable()) {
      try {
        await apiRequestPasswordReset(email);
      } catch (error) {
        if (!shouldUseLocalAuthFallback(error)) {
          throw error;
        }
      }
    }

    const nextNotifications = [
      {
        id: `notif-reset-${Date.now()}`,
        title: 'Password reset requested',
        description: isPlatformApiAvailable()
          ? `A reset link was prepared for ${email}.`
          : `A reset link was prepared for ${email}. Connect your backend mailer to send it.`,
        createdAt: 'Just now',
        unread: true,
      },
      ...notifications,
    ];
    setNotifications(nextNotifications);
    persist({ notifications: nextNotifications });
  };

  const oauthLogin = async (provider: 'google' | 'github', role: UserRole = 'buyer') => {
    try {
      const nextUser = await apiOAuthLogin(provider, role);
      return completeAuth(nextUser);
    } catch (error) {
      if (!shouldUseLocalAuthFallback(error)) {
        throw error;
      }
    }

    const nextUser: AppUser = {
      id: `${provider}-${Date.now()}`,
      name: `${provider === 'google' ? 'Google' : 'GitHub'} User`,
      email: `${provider}.user@gridstore.local`,
      role,
      sessionToken: createSessionToken(),
      verified: true,
    };
    setUser(nextUser);
    persist({ user: nextUser });
    return nextUser;
  };

  const logout = () => {
    void apiLogout().catch(() => {
      setAuthToken(null);
    });
    setUser(null);
    persist({ user: null });
  };

  const addToCart = (productId: string, quantity = 1) => {
    const next = { ...cart, [productId]: (cart[productId] ?? 0) + quantity };
    setCart(next);
    persist({ cart: next });
    if (isPlatformApiAvailable() && user) {
      void apiSaveCart(next).catch(() => undefined);
    }
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    const next = { ...cart };
    if (quantity <= 0) {
      delete next[productId];
    } else {
      next[productId] = quantity;
    }
    setCart(next);
    persist({ cart: next });
    if (isPlatformApiAvailable() && user) {
      void apiSaveCart(next).catch(() => undefined);
    }
  };

  const removeFromCart = (productId: string) => {
    const next = { ...cart };
    delete next[productId];
    setCart(next);
    persist({ cart: next });
    if (isPlatformApiAvailable() && user) {
      void apiSaveCart(next).catch(() => undefined);
    }
  };

  const toggleWishlist = (productId: string) => {
    const next = wishlistIds.includes(productId)
      ? wishlistIds.filter((id) => id !== productId)
      : [...wishlistIds, productId];
    setWishlistIds(next);
    persist({ wishlistIds: next });
    if (isPlatformApiAvailable() && user) {
      void apiSaveWishlist(next).catch(() => undefined);
    }
  };

  const isInWishlist = (productId: string) => wishlistIds.includes(productId);

  const createOrder = async ({ deliveryAddress, paymentMethod }: CheckoutInput) => {
    if (!cartLines.length) throw new Error('Cart is empty');
    if (!deliveryAddress.trim()) throw new Error('Delivery address is required');

    const lines = cartLines.map((item) => ({
      productId: item.product.id,
      title: item.product.title,
      seller: item.product.seller,
      quantity: item.quantity,
      unitPrice: item.product.price,
    }));

    if (isPlatformApiAvailable() && user) {
      try {
        const nextOrder = await apiCreateOrder({
          deliveryAddress,
          paymentMethod,
          lines,
        });
        const nextOrders = [nextOrder, ...orders];
        setOrders(nextOrders);
        setCart({});
        persist({ orders: nextOrders, cart: {} });
        return nextOrder;
      } catch {
        // Fall back to local order creation.
      }
    }

    const nextOrder: Order = {
      id: `ord-${Date.now()}`,
      status: paymentMethod === 'manual_eft' ? 'pending_payment' : 'paid',
      paymentStatus: paymentMethod === 'manual_eft' ? 'requires_provider' : 'paid',
      total: cartTotal,
      deliveryAddress,
      receiptNumber: `GS-${Date.now().toString().slice(-8)}`,
      createdAt: nowLabel(),
      lines,
    };
    const nextOrders = [nextOrder, ...orders];
    setOrders(nextOrders);
    setCart({});
    persist({ orders: nextOrders, cart: {} });
    return nextOrder;
  };

  const requestRefund = async (orderId: string) => {
    if (isPlatformApiAvailable() && user) {
      try {
        const updated = await apiRefundOrder(orderId);
        const nextOrders = orders.map((order) => (order.id === orderId ? updated : order));
        setOrders(nextOrders);
        persist({ orders: nextOrders });
        return;
      } catch {
        // Fall back to local refund update.
      }
    }

    const nextOrders = orders.map((order) =>
      order.id === orderId ? { ...order, status: 'refunded' as const, paymentStatus: 'refunded' as const } : order
    );
    setOrders(nextOrders);
    persist({ orders: nextOrders });
  };

  const createSellerListing = async (input: SellerListingInput) => {
    if (isPlatformApiAvailable() && user) {
      try {
        const nextListing = await apiCreateListing(input);
        const nextListings = [nextListing, ...sellerListings.filter((item) => item.id !== nextListing.id)];
        setSellerListings(nextListings);
        persist({ sellerListings: nextListings });
        return nextListing;
      } catch {
        // Fall back to local listing creation.
      }
    }

    const nextListing: SellerListing = {
      id: `listing-${Date.now()}`,
      title: input.title,
      category: input.category,
      price: input.price,
      rating: 0,
      reviews: 0,
      seller: user?.name ?? 'My Store',
      location: input.location,
      image:
        'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&q=80&w=800',
      description: input.description,
      status: 'draft',
      inventory: input.inventory,
      riskScore: Math.max(3, Math.min(35, Math.round(60 / Math.max(input.inventory, 1)))),
      verified: Boolean(user?.verified),
      saleMode: input.saleMode ?? (input.haggleEnabled ? 'haggle' : 'fixed'),
      haggleEnabled: Boolean(input.haggleEnabled || input.saleMode === 'haggle'),
      startingBid: input.saleMode === 'auction' ? (input.startingBid ?? input.price) : undefined,
      currentBid: input.saleMode === 'auction' ? 0 : undefined,
      bidIncrement: input.saleMode === 'auction' ? (input.bidIncrement ?? 50) : undefined,
      reservePrice: input.saleMode === 'auction' ? input.reservePrice : undefined,
      auctionEndsAt:
        input.saleMode === 'auction'
          ? new Date(Date.now() + (input.auctionDurationHours ?? 72) * 60 * 60 * 1000).toISOString()
          : undefined,
      auctionStatus: input.saleMode === 'auction' ? 'live' : 'none',
      bidCount: 0,
    };
    const nextListings = [nextListing, ...sellerListings];
    setSellerListings(nextListings);
    persist({ sellerListings: nextListings });
    return nextListing;
  };

  const updateSellerListing = async (listingId: string, input: Partial<SellerListingInput>) => {
    if (isPlatformApiAvailable() && user) {
      try {
        const updated = await apiUpdateListing(listingId, input);
        const nextListings = sellerListings.map((listing) =>
          listing.id === listingId ? updated : listing
        );
        setSellerListings(nextListings);
        persist({ sellerListings: nextListings });
        return;
      } catch {
        // Fall back to local listing update.
      }
    }

    const nextListings = sellerListings.map((listing) =>
      listing.id === listingId
        ? {
            ...listing,
            ...input,
            status: input.inventory === 0 ? 'paused' : listing.status,
          }
        : listing
    );
    setSellerListings(nextListings);
    persist({ sellerListings: nextListings });
  };

  const pauseSellerListing = async (listingId: string) => {
    if (isPlatformApiAvailable() && user) {
      try {
        const updated = await apiToggleListingPause(listingId);
        const nextListings = sellerListings.map((listing) =>
          listing.id === listingId ? updated : listing
        );
        setSellerListings(nextListings);
        persist({ sellerListings: nextListings });
        return;
      } catch {
        // Fall back to local pause toggle.
      }
    }

    const nextListings = sellerListings.map((listing) =>
      listing.id === listingId
        ? { ...listing, status: listing.status === 'paused' ? 'active' : 'paused' }
        : listing
    );
    setSellerListings(nextListings);
    persist({ sellerListings: nextListings });
  };

  const createStorefront = async (input: StorefrontInput) => {
    if (!user) throw new Error('Sign in as a seller to create a storefront');

    if (isPlatformApiAvailable()) {
      const store = await apiCreateStore(input);
      const nextStores = [store, ...sellerStores.filter((item) => item.id !== store.id)];
      setSellerStores(nextStores);
      persist({ sellerStores: nextStores });
      return store;
    }

    const store: StoreProfile = {
      id: `store-${Date.now()}`,
      name: input.name.trim(),
      category: input.category.trim(),
      location: input.location.trim(),
      description: input.description.trim(),
      supportEmail: input.supportEmail?.trim(),
      status: input.status ?? 'active',
      verified: Boolean(user.verified),
      rating: 0,
      followers: 0,
      image:
        'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=800',
    };
    const nextStores = [store, ...sellerStores];
    setSellerStores(nextStores);
    persist({ sellerStores: nextStores });
    return store;
  };

  const updateStorefront = async (storeId: string, input: Partial<StorefrontInput>) => {
    if (!user) throw new Error('Sign in as a seller to update a storefront');

    if (isPlatformApiAvailable()) {
      const store = await apiUpdateStore(storeId, input);
      const nextStores = sellerStores.map((item) => (item.id === storeId ? store : item));
      setSellerStores(nextStores);
      persist({ sellerStores: nextStores });
      return store;
    }

    const nextStores = sellerStores.map((item) =>
      item.id === storeId
        ? {
            ...item,
            ...input,
            name: input.name?.trim() ?? item.name,
            category: input.category?.trim() ?? item.category,
            location: input.location?.trim() ?? item.location,
            description: input.description?.trim() ?? item.description,
            supportEmail: input.supportEmail?.trim() ?? item.supportEmail,
          }
        : item
    );
    const updated = nextStores.find((item) => item.id === storeId);
    if (!updated) throw new Error('Store not found');
    setSellerStores(nextStores);
    persist({ sellerStores: nextStores });
    return updated;
  };

  const generateListingDraft = (seed: string): SellerListingInput => {
    const normalizedSeed = (seed ?? '').toLowerCase();
    return {
    title: seed.trim() ? `${seed.trim()} - Verified Local Listing` : 'AI generated listing',
    category: normalizedSeed.includes('solar') ? 'Home & Garden' : 'Electronics',
    price: normalizedSeed.includes('premium') ? 24999 : 4999,
    inventory: 3,
    location: 'Cape Town',
    description:
      'AI draft: highlight condition, warranty, delivery coverage, proof of ownership, and clear return terms before publishing.',
    saleMode: 'fixed',
    haggleEnabled: false,
  };
  };

  const refreshListingInState = (listing: SellerListing) => {
    const nextListings = sellerListings.map((item) => (item.id === listing.id ? listing : item));
    setSellerListings(nextListings);
    persist({ sellerListings: nextListings });
  };

  const submitOffer = async (listingId: string, amount: number, message?: string) => {
    if (!user) throw new Error('Sign in to make an offer');
    if (isPlatformApiAvailable()) {
      return apiSubmitOffer({ listingId, amount, message });
    }

    const listing = sellerListings.find((item) => item.id === listingId);
    if (!listing?.haggleEnabled && listing?.saleMode !== 'haggle') {
      throw new Error('Haggle is not enabled for this listing');
    }
    if (amount >= listing.price) {
      throw new Error('Offer must be below the asking price');
    }

    return {
      id: `offer-${Date.now()}`,
      listingId,
      listingTitle: listing.title,
      buyerId: user.id,
      buyerName: user.name,
      amount,
      message,
      status: 'pending' as const,
      createdAt: new Date().toLocaleString('en-ZA'),
    };
  };

  const respondToOffer = async (
    offerId: string,
    action: 'accept' | 'decline' | 'counter',
    counterAmount?: number
  ) => {
    if (!user) throw new Error('Sign in as seller to respond');
    if (isPlatformApiAvailable()) {
      return apiRespondToOffer(offerId, action, counterAmount);
    }

    return {
      id: offerId,
      listingId: '',
      listingTitle: '',
      buyerId: '',
      buyerName: '',
      amount: 0,
      status: action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'countered',
      counterAmount,
      createdAt: new Date().toLocaleString('en-ZA'),
    } as HaggleOffer;
  };

  const loadListingOffers = async (listingId: string) => {
    if (isPlatformApiAvailable() && user) {
      return apiGetListingOffers(listingId);
    }
    return [];
  };

  const loadIncomingOffers = async () => {
    if (isPlatformApiAvailable() && user) {
      return apiGetIncomingOffers();
    }
    return [];
  };

  const placeBid = async (listingId: string, amount: number) => {
    if (!user) throw new Error('Sign in to place a bid');
    if (isPlatformApiAvailable()) {
      const result = await apiPlaceBid(listingId, amount);
      refreshListingInState(result.listing);
      return result;
    }

    const listing = sellerListings.find((item) => item.id === listingId);
    if (!listing || listing.saleMode !== 'auction') {
      throw new Error('This listing is not an auction');
    }

    const minBid = (listing.currentBid ?? 0) > 0
      ? (listing.currentBid ?? 0) + (listing.bidIncrement ?? 50)
      : (listing.startingBid ?? listing.price);
    if (amount < minBid) {
      throw new Error(`Minimum bid is R ${minBid.toLocaleString('en-ZA')}`);
    }

    const updatedListing: SellerListing = {
      ...listing,
      currentBid: amount,
      bidCount: (listing.bidCount ?? 0) + 1,
    };
    refreshListingInState(updatedListing);

    return {
      bid: {
        id: `bid-${Date.now()}`,
        listingId,
        bidderId: user.id,
        bidderName: user.name,
        amount,
        createdAt: new Date().toLocaleString('en-ZA'),
      },
      listing: updatedListing,
    };
  };

  const markNotificationRead = (id: string) => {
    const next = notifications.map((item) =>
      item.id === id ? { ...item, unread: false } : item
    );
    setNotifications(next);
    persist({ notifications: next });
    if (isPlatformApiAvailable() && user) {
      void apiMarkNotificationRead(id).catch(() => undefined);
    }
  };

  const clearAllNotifications = () => {
    const next = notifications.map((item) => ({ ...item, unread: false }));
    setNotifications(next);
    persist({ notifications: next });
    if (isPlatformApiAvailable() && user) {
      void apiClearNotifications().catch(() => undefined);
    }
  };

  const sendMessage = (
    threadId: string,
    text: string,
    author: 'buyer' | 'seller' = 'buyer'
  ) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    const nextMessage: MessageItem = {
      id: `msg-${Date.now()}`,
      text: cleanText,
      author,
      createdAt: 'Just now',
    };

    const existingThread = messageThreads.find((thread) => thread.id === threadId);
    const nextThreads = existingThread
      ? messageThreads.map((thread) =>
          thread.id === threadId
            ? { ...thread, messages: [...thread.messages, nextMessage] }
            : thread
        )
      : [
          ...messageThreads,
          {
            id: threadId,
            title: 'New conversation',
            participant: 'Support',
            messages: [nextMessage],
          },
        ];

    setMessageThreads(nextThreads);
    persist({ messageThreads: nextThreads });

    if (isPlatformApiAvailable() && user) {
      void apiSendMessage(threadId, { text: cleanText, author }).catch(() => undefined);
    }
  };

  const requestServiceBooking = (
    serviceId: string,
    serviceTitle: string,
    provider: string,
    note: string
  ) => {
    const localRequest: BookingRequest = {
      id: `booking-${Date.now()}`,
      serviceId,
      serviceTitle,
      provider,
      requestedDate: 'Next available',
      note: note.trim() || 'Please send a quote and available times.',
      status: 'requested',
      createdAt: nowLabel(),
    };

    const applyLocal = (request: BookingRequest) => {
      const nextRequests = [request, ...bookingRequests];
      setBookingRequests(nextRequests);
      persist({ bookingRequests: nextRequests });
    };

    if (isPlatformApiAvailable() && user) {
      void apiCreateBooking({
        serviceId,
        serviceTitle,
        provider,
        note,
      })
        .then(applyLocal)
        .catch(() => applyLocal(localRequest));
      return;
    }

    applyLocal(localRequest);
  };

  const requestRentalReservation = (
    rentalId: string,
    rentalTitle: string,
    startDate: string,
    endDate: string
  ) => {
    const localReservation: RentalReservation = {
      id: `rental-${Date.now()}`,
      rentalId,
      rentalTitle,
      startDate,
      endDate,
      status: startDate && endDate ? 'requested' : 'unavailable',
      createdAt: nowLabel(),
    };

    const applyLocal = (reservation: RentalReservation) => {
      const nextReservations = [reservation, ...rentalReservations];
      setRentalReservations(nextReservations);
      persist({ rentalReservations: nextReservations });
    };

    if (isPlatformApiAvailable() && user) {
      void apiCreateReservation({ rentalId, rentalTitle, startDate, endDate })
        .then(applyLocal)
        .catch(() => applyLocal(localReservation));
      return;
    }

    applyLocal(localReservation);
  };

  const submitJobApplication = (
    jobId: string,
    jobTitle: string,
    applicantName: string,
    cvFileName: string
  ) => {
    const localApplication: JobApplication = {
      id: `application-${Date.now()}`,
      jobId,
      jobTitle,
      applicantName: applicantName.trim() || user?.name || 'Applicant',
      cvFileName: cvFileName || 'profile-cv.pdf',
      status: 'submitted',
      createdAt: nowLabel(),
    };

    const applyLocal = (application: JobApplication) => {
      const nextApplications = [application, ...jobApplications];
      setJobApplications(nextApplications);
      persist({ jobApplications: nextApplications });
    };

    if (isPlatformApiAvailable() && user) {
      void apiCreateApplication({ jobId, jobTitle, applicantName, cvFileName })
        .then(applyLocal)
        .catch(() => applyLocal(localApplication));
      return;
    }

    applyLocal(localApplication);
  };

  const reportTrustIssue = (
    targetType: TrustReport['targetType'],
    targetId: string,
    reason: string
  ) => {
    const localReport: TrustReport = {
      id: `report-${Date.now()}`,
      targetType,
      targetId,
      reason: reason.trim() || 'Needs marketplace review',
      status: 'open',
      createdAt: nowLabel(),
    };

    const applyLocal = (report: TrustReport) => {
      const nextReports = [report, ...trustReports];
      setTrustReports(nextReports);
      persist({ trustReports: nextReports });
    };

    if (isPlatformApiAvailable() && user) {
      void apiCreateReport({ targetType, targetId, reason })
        .then(applyLocal)
        .catch(() => applyLocal(localReport));
      return;
    }

    applyLocal(localReport);
  };

  const updateProfile = async (input: { name: string; email: string }) => {
    if (!user) {
      throw new Error('Sign in to update your profile');
    }
    if (!input.email.includes('@')) {
      throw new Error('Enter a valid email address');
    }

    if (isPlatformApiAvailable()) {
      const nextUser = await apiUpdateProfile(input);
      setUser(nextUser);
      persist({ user: nextUser });
      return;
    }

    const nextUser: AppUser = {
      ...user,
      name: input.name.trim(),
      email: input.email.trim(),
    };
    setUser(nextUser);
    persist({ user: nextUser });
  };

  const unreadNotifications = notifications.filter((item) => item.unread).length;
  const payoutSummary = useMemo(
    () => ({
      available: orders
        .filter((order) => order.status === 'delivered' || order.status === 'paid')
        .reduce((sum, order) => sum + order.total * 0.88, 0),
      pending: orders
        .filter((order) => order.status === 'pending_payment' || order.status === 'processing')
        .reduce((sum, order) => sum + order.total * 0.88, 0),
      nextPayoutDate: 'Friday',
    }),
    [orders]
  );

  return (
    <AppContext.Provider
      value={{
        user,
        cartLines,
        cartCount,
        cartTotal,
        wishlistIds,
        notifications,
        messageThreads,
        orders,
        sellerListings,
        sellerStores,
        bookingRequests,
        rentalReservations,
        jobApplications,
        trustReports,
        payoutSummary,
        unreadNotifications,
        login,
        signup,
        requestPasswordReset,
        oauthLogin,
        logout,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        isInWishlist,
        toggleWishlist,
        createOrder,
        requestRefund,
        createSellerListing,
        updateSellerListing,
        pauseSellerListing,
        createStorefront,
        updateStorefront,
        generateListingDraft,
        submitOffer,
        respondToOffer,
        loadListingOffers,
        loadIncomingOffers,
        placeBid,
        markNotificationRead,
        clearAllNotifications,
        sendMessage,
        requestServiceBooking,
        requestRentalReservation,
        submitJobApplication,
        reportTrustIssue,
        updateProfile,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return context;
}
