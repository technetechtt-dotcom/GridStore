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

export interface StoredStore extends StoreProfile {
  ownerId: string;
}

export interface StoresStore {
  ensureSeeded(): Promise<void>;
  listPublicStores(query?: string): Promise<StoreProfile[]>;
  listOwnerStores(ownerId: string): Promise<StoreProfile[]>;
  getStore(id: string): Promise<StoreProfile | undefined>;
  createStore(ownerId: string, verified: boolean, input: StoreInput): Promise<StoreProfile>;
  updateStore(ownerId: string, storeId: string, input: Partial<StoreInput>): Promise<StoreProfile>;
}
