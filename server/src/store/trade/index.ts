import { env } from '../../config/env.js';
import { MemoryTradeStore } from './memoryTradeStore.js';
import { PostgresTradeStore } from './postgresTradeStore.js';
import type { TradeStore } from './types.js';

export type { TradeStore } from './types.js';

export let tradeStore: TradeStore;

export async function initTradeStore() {
  if (env.databaseUrl) {
    const store = new PostgresTradeStore();
    await store.ensureSeeded();
    tradeStore = store;
    return store;
  }

  const store = new MemoryTradeStore();
  await store.ensureSeeded();
  tradeStore = store;
  return store;
}

if (!env.databaseUrl) {
  tradeStore = new MemoryTradeStore();
  void tradeStore.ensureSeeded();
}
