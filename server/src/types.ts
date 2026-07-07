export interface Product {
  id: string;
  title: string;
  category: string;
  price: number;
  rating: number;
  reviews: number;
  seller: string;
  location: string;
  badge?: string;
  image: string;
  description: string;
}

export interface Service {
  id: string;
  title: string;
  provider: string;
  category: string;
  priceLabel: string;
  rating: number;
  location: string;
  image: string;
  description: string;
}

export interface Rental {
  id: string;
  title: string;
  owner: string;
  category: string;
  dailyRate: number;
  location: string;
  image: string;
  description: string;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salaryLabel: string;
  type: string;
  description: string;
}

export interface StoreProfile {
  id: string;
  name: string;
  category: string;
  rating: number;
  followers: number;
  location: string;
  description: string;
}

export type UserRole = 'buyer' | 'seller' | 'moderator' | 'admin';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  verified: boolean;
}

export interface AuthUser extends AppUser {
  sessionToken: string;
}

export interface OrderLine {
  productId: string;
  title: string;
  seller: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  userId: string;
  status: 'pending_payment' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'refunded';
  paymentStatus: 'requires_provider' | 'authorized' | 'paid' | 'refunded';
  total: number;
  deliveryAddress: string;
  receiptNumber: string;
  createdAt: string;
  lines: OrderLine[];
}

export interface SellerListing extends Product {
  sellerId: string;
  status: 'active' | 'draft' | 'paused' | 'flagged';
  inventory: number;
  riskScore: number;
  verified: boolean;
}

export interface StoredUser extends AppUser {
  passwordHash: string;
}
