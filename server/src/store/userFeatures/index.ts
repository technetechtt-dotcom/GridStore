import { env } from '../../config/env.js';
import { MemoryUserFeaturesStore } from './memoryStore.js';
import { PostgresUserFeaturesStore } from './postgresStore.js';
import type { UserFeaturesStore } from './types.js';

export type { UserFeaturesStore } from './types.js';

export let userFeaturesStore: UserFeaturesStore;

export async function initUserFeaturesStore() {
  if (env.databaseUrl) {
    const store = new PostgresUserFeaturesStore();
    await store.ensureSeeded();
    userFeaturesStore = store;
    return store;
  }

  const store = new MemoryUserFeaturesStore();
  await store.ensureSeeded();
  userFeaturesStore = store;
  return store;
}

if (!env.databaseUrl) {
  userFeaturesStore = new MemoryUserFeaturesStore();
  void userFeaturesStore.ensureSeeded();
}
