import type { StoreProfile } from '../../types.js';

export interface StoreInput {
  name: string;
  category: string;
  location: string;
  description: string;
  supportEmail?: string;
  image?: string;
  status?: 'active' | 'draft' | 'paused';
}

export interface AdminStorePatch {
  name?: string;
  category?: string;
  location?: string;
  description?: string;
  supportEmail?: string;
  status?: 'active' | 'draft' | 'paused';
  verified?: boolean;
}

export interface StoredStore extends StoreProfile {
  ownerId: string;
  createdAt?: string;
}

export interface AdminStoreRecord extends StoreProfile {
  ownerId: string;
  createdAt?: string;
}

export interface StoresStore {
  ensureSeeded(): Promise<void>;
  listPublicStores(query?: string): Promise<StoreProfile[]>;
  listOwnerStores(ownerId: string): Promise<StoreProfile[]>;
  listAllStoresAdmin(): Promise<AdminStoreRecord[]>;
  getStore(id: string): Promise<StoreProfile | undefined>;
  createStore(ownerId: string, verified: boolean, input: StoreInput): Promise<StoreProfile>;
  updateStore(ownerId: string, storeId: string, input: Partial<StoreInput>): Promise<StoreProfile>;
  adminUpdateStore(storeId: string, input: AdminStorePatch): Promise<StoreProfile>;
  countStores(): Promise<number>;
}
