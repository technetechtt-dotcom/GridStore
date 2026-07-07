import { env } from '../config/env.js';
import { MemoryPlatformStore } from './memoryPlatformStore.js';
import { PostgresPlatformStore } from './postgresPlatformStore.js';
import type { PlatformStore } from './storeTypes.js';

export type { PlatformStore } from './storeTypes.js';

export let platformStore: PlatformStore;

export async function initPlatformStore() {
  if (env.databaseUrl) {
    const store = new PostgresPlatformStore();
    await store.ensureSeeded();
    platformStore = store;
    console.log('Platform store: PostgreSQL (Neon)');
    return store;
  }

  const store = new MemoryPlatformStore();
  await store.ensureSeeded();
  platformStore = store;
  console.log('Platform store: in-memory');
  return store;
}

if (!env.databaseUrl) {
  platformStore = new MemoryPlatformStore();
  void platformStore.ensureSeeded();
}
