import { seedStores } from '../../data/seed.js';
import { createId } from '../../lib/ids.js';
import { matchesQuery } from '../../lib/search.js';
import type { StoreProfile } from '../../types.js';
import type { StoreInput, StoredStore, StoresStore, AdminStorePatch } from './types.js';

const DEFAULT_STORE_IMAGE =
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=800';

function toPublicStore(store: StoredStore): StoreProfile {
  const { ownerId: _ownerId, createdAt: _createdAt, ...publicStore } = store;
  return publicStore;
}

export class MemoryStoresStore implements StoresStore {
  private stores: StoredStore[] = [];
  private seeded = false;

  async ensureSeeded() {
    if (this.seeded) return;
    this.stores = seedStores.map((store) => ({
      ...store,
      ownerId: 'user-demo-seller',
      supportEmail: store.supportEmail ?? 'seller@gridstore.local',
      status: 'active' as const,
      verified: store.verified ?? true,
      image: store.image ?? DEFAULT_STORE_IMAGE,
      createdAt: new Date().toISOString(),
    }));
    this.seeded = true;
  }

  async listPublicStores(query = '') {
    await this.ensureSeeded();
    return this.stores
      .filter((store) => store.status === 'active')
      .filter((store) =>
        matchesQuery([store.name, store.category, store.location, store.description], query)
      )
      .map(toPublicStore);
  }

  async listOwnerStores(ownerId: string) {
    await this.ensureSeeded();
    return this.stores.filter((store) => store.ownerId === ownerId).map(toPublicStore);
  }

  async listAllStoresAdmin() {
    await this.ensureSeeded();
    return this.stores.map((store) => ({
      ...toPublicStore(store),
      ownerId: store.ownerId,
      createdAt: store.createdAt,
    }));
  }

  async countStores() {
    await this.ensureSeeded();
    return this.stores.length;
  }

  async getStore(id: string) {
    await this.ensureSeeded();
    const store = this.stores.find((item) => item.id === id);
    return store ? toPublicStore(store) : undefined;
  }

  async createStore(ownerId: string, verified: boolean, input: StoreInput) {
    await this.ensureSeeded();
    const store: StoredStore = {
      id: createId('store'),
      ownerId,
      name: input.name.trim(),
      category: input.category.trim(),
      location: input.location.trim(),
      description: input.description.trim(),
      supportEmail: input.supportEmail?.trim(),
      status: input.status ?? 'active',
      verified,
      rating: 0,
      followers: 0,
      image: input.image ?? DEFAULT_STORE_IMAGE,
      createdAt: new Date().toISOString(),
    };
    this.stores.unshift(store);
    return toPublicStore(store);
  }

  async updateStore(ownerId: string, storeId: string, input: Partial<StoreInput>) {
    await this.ensureSeeded();
    const store = this.stores.find((item) => item.id === storeId && item.ownerId === ownerId);
    if (!store) {
      throw new Error('Store not found');
    }

    if (input.name !== undefined) store.name = input.name.trim();
    if (input.category !== undefined) store.category = input.category.trim();
    if (input.location !== undefined) store.location = input.location.trim();
    if (input.description !== undefined) store.description = input.description.trim();
    if (input.supportEmail !== undefined) store.supportEmail = input.supportEmail.trim();
    if (input.image !== undefined) store.image = input.image;
    if (input.status !== undefined) store.status = input.status;

    return toPublicStore(store);
  }

  async adminUpdateStore(storeId: string, input: AdminStorePatch) {
    await this.ensureSeeded();
    const store = this.stores.find((item) => item.id === storeId);
    if (!store) {
      throw new Error('Store not found');
    }

    if (input.name !== undefined) store.name = input.name.trim();
    if (input.category !== undefined) store.category = input.category.trim();
    if (input.location !== undefined) store.location = input.location.trim();
    if (input.description !== undefined) store.description = input.description.trim();
    if (input.supportEmail !== undefined) store.supportEmail = input.supportEmail.trim();
    if (input.status !== undefined) store.status = input.status;
    if (input.verified !== undefined) store.verified = input.verified;

    return toPublicStore(store);
  }
}
