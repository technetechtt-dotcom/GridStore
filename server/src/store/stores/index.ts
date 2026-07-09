import { env } from '../../config/env.js';
import { MemoryStoresStore } from './memoryStoresStore.js';
import { PostgresStoresStore } from './postgresStoresStore.js';
import type { StoresStore } from './types.js';

export type { AdminStorePatch, AdminStoreRecord, StoreInput, StoresStore } from './types.js';

export let storesStore: StoresStore;

export async function initStoresStore() {
  if (env.databaseUrl) {
    const store = new PostgresStoresStore();
    await store.ensureSeeded();
    storesStore = store;
    return store;
  }

  const store = new MemoryStoresStore();
  await store.ensureSeeded();
  storesStore = store;
  return store;
}

if (!env.databaseUrl) {
  storesStore = new MemoryStoresStore();
  void storesStore.ensureSeeded();
}
