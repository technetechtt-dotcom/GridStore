import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { products } from '../data/catalog';
import {
  apiCreateListing,
  apiCreateOrder,
  apiGetActiveListings,
  apiGetMe,
  apiLogin,
  apiLogout,
  apiOAuthLogin,
  apiRefundOrder,
  apiRequestPasswordReset,
  apiSignup,
  apiToggleListingPause,
  apiUpdateListing,
  apiUpdateProfile,
  getAuthToken,
  isPlatformApiAvailable,
  setAuthToken,
  shouldUseLocalAuthFallback,
  syncPlatformData,
} from '../services/platformApi';
import { probeApiConnection, subscribeApiMode } from '../services/mockApi';
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
} from '../types';

interface CartLine {
  product: Product;
  quantity: number;
}

interface CheckoutInput {
  deliveryAddress: string;
  paymentMethod: string;
}

interface SellerListingInput {
  title: string;
  category: string;
  price: number;
  inventory: number;
  description: string;
  location: string;
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
  generateListingDraft: (seed: string) => SellerListingInput;
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
  const lower = email.toLowerCase();
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
  const initialState = useMemo(() => loadState(), []);

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
      bookingRequests: next.bookingRequests ?? bookingRequests,
      rentalReservations: next.rentalReservations ?? rentalReservations,
      jobApplications: next.jobApplications ?? jobApplications,
      trustReports: next.trustReports ?? trustReports,
    });
  };

  const refreshFromApi = useCallback(async () => {
    if (!isPlatformApiAvailable()) return;

    try {
      const synced = await syncPlatformData();
      if (synced.user) {
        setUser(synced.user);
      }
      setOrders(synced.orders);
      if (synced.sellerListings.length) {
        setSellerListings(synced.sellerListings);
      } else if (!getAuthToken()) {
        const activeListings = await apiGetActiveListings();
        if (activeListings.length) {
          setSellerListings(activeListings);
        }
      }
      persist({
        user: synced.user ?? user,
        orders: synced.orders,
        sellerListings: synced.sellerListings.length
          ? synced.sellerListings
          : sellerListings,
      });
    } catch {
      // Keep local persisted state when sync fails.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist mirrors current React state snapshot
  }, [sellerListings, user]);

  useEffect(() => {
    void probeApiConnection();
    return subscribeApiMode((mode) => {
      if (mode === 'live') {
        void refreshFromApi();
      }
    });
  }, [refreshFromApi]);

  useEffect(() => {
    void (async () => {
      const token = getAuthToken();
      if (!token) return;
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

  const completeAuth = async (nextUser: AppUser) => {
    setUser(nextUser);
    try {
      const synced = await syncPlatformData();
      setOrders(synced.orders);
      if (synced.sellerListings.length) {
        setSellerListings(synced.sellerListings);
      }
      persist({
        user: synced.user ?? nextUser,
        orders: synced.orders,
        sellerListings: synced.sellerListings.length ? synced.sellerListings : sellerListings,
      });
      return synced.user ?? nextUser;
    } catch {
      persist({ user: nextUser });
      return nextUser;
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
    try {
      const nextUser = await apiLogin(email, password, role);
      return completeAuth(nextUser);
    } catch (error) {
      if (!shouldUseLocalAuthFallback(error)) {
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
  };

  const removeFromCart = (productId: string) => {
    const next = { ...cart };
    delete next[productId];
    setCart(next);
    persist({ cart: next });
  };

  const toggleWishlist = (productId: string) => {
    const next = wishlistIds.includes(productId)
      ? wishlistIds.filter((id) => id !== productId)
      : [...wishlistIds, productId];
    setWishlistIds(next);
    persist({ wishlistIds: next });
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

  const generateListingDraft = (seed: string): SellerListingInput => ({
    title: seed.trim() ? `${seed.trim()} - Verified Local Listing` : 'AI generated listing',
    category: seed.toLowerCase().includes('solar') ? 'Home & Garden' : 'Electronics',
    price: seed.toLowerCase().includes('premium') ? 24999 : 4999,
    inventory: 3,
    location: 'Cape Town',
    description:
      'AI draft: highlight condition, warranty, delivery coverage, proof of ownership, and clear return terms before publishing.',
  });

  const markNotificationRead = (id: string) => {
    const next = notifications.map((item) =>
      item.id === id ? { ...item, unread: false } : item
    );
    setNotifications(next);
    persist({ notifications: next });
  };

  const clearAllNotifications = () => {
    const next = notifications.map((item) => ({ ...item, unread: false }));
    setNotifications(next);
    persist({ notifications: next });
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
  };

  const requestServiceBooking = (
    serviceId: string,
    serviceTitle: string,
    provider: string,
    note: string
  ) => {
    const nextRequests = [
      {
        id: `booking-${Date.now()}`,
        serviceId,
        serviceTitle,
        provider,
        requestedDate: 'Next available',
        note: note.trim() || 'Please send a quote and available times.',
        status: 'requested' as const,
        createdAt: nowLabel(),
      },
      ...bookingRequests,
    ];
    setBookingRequests(nextRequests);
    persist({ bookingRequests: nextRequests });
  };

  const requestRentalReservation = (
    rentalId: string,
    rentalTitle: string,
    startDate: string,
    endDate: string
  ) => {
    const nextReservations = [
      {
        id: `rental-${Date.now()}`,
        rentalId,
        rentalTitle,
        startDate,
        endDate,
        status: startDate && endDate ? ('requested' as const) : ('unavailable' as const),
        createdAt: nowLabel(),
      },
      ...rentalReservations,
    ];
    setRentalReservations(nextReservations);
    persist({ rentalReservations: nextReservations });
  };

  const submitJobApplication = (
    jobId: string,
    jobTitle: string,
    applicantName: string,
    cvFileName: string
  ) => {
    const nextApplications = [
      {
        id: `application-${Date.now()}`,
        jobId,
        jobTitle,
        applicantName: applicantName.trim() || user?.name || 'Applicant',
        cvFileName: cvFileName || 'profile-cv.pdf',
        status: 'submitted' as const,
        createdAt: nowLabel(),
      },
      ...jobApplications,
    ];
    setJobApplications(nextApplications);
    persist({ jobApplications: nextApplications });
  };

  const reportTrustIssue = (
    targetType: TrustReport['targetType'],
    targetId: string,
    reason: string
  ) => {
    const nextReports = [
      {
        id: `report-${Date.now()}`,
        targetType,
        targetId,
        reason: reason.trim() || 'Needs marketplace review',
        status: 'open' as const,
        createdAt: nowLabel(),
      },
      ...trustReports,
    ];
    setTrustReports(nextReports);
    persist({ trustReports: nextReports });
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
        generateListingDraft,
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
